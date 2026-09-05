package serviceslayer

import (
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

// ServiceHealthResult is one probe outcome.
type ServiceHealthResult struct {
	ServiceID   string `json:"serviceId"`
	ServiceName string `json:"serviceName"`
	OldStatus   string `json:"oldStatus"`
	NewStatus   string `json:"newStatus"`
	Changed     bool   `json:"changed"`
	Online      bool   `json:"online"`
	Method      string `json:"method"` // http | tcp | skip
	VPSName     string `json:"vpsName,omitempty"`
	URL         string `json:"url,omitempty"`
}

func normalizeServiceStatus(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "running", "online", "active":
		return "running"
	case "stopped", "offline", "down":
		return "stopped"
	default:
		return "unknown"
	}
}

var (
	serviceStateMu     sync.Mutex
	serviceFailures    = make(map[string]int)       // serviceID -> consecutive failure count
	serviceAlertActive = make(map[string]bool)      // serviceID -> true if OFFLINE alert was sent
	serviceLastAlert   = make(map[string]time.Time) // serviceID -> timestamp of last email alert
	swarmReplicaRe     = regexp.MustCompile(`\.[0-9]+\.[a-zA-Z0-9]{5,}`)
)

// isSwarmReplicaName returns true if a name or URL contains a temporary Docker Swarm container task ID
func isSwarmReplicaName(s string) bool {
	return swarmReplicaRe.MatchString(s)
}

// CheckHTTPHealthFast executes a lightweight, resilient HTTP probe with retries, SSL tolerance, and fallback.
func CheckHTTPHealthFast(rawURL string, maxRetries int, timeout time.Duration) (online bool, statusCode int) {
	if maxRetries <= 0 {
		maxRetries = 3
	}
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	target := NormalizeURL(rawURL)
	targets := []string{target}
	if strings.HasPrefix(target, "https://") {
		targets = append(targets, strings.Replace(target, "https://", "http://", 1))
	}

	tr := &http.Transport{
		TLSClientConfig:       &tls.Config{InsecureSkipVerify: true},
		ResponseHeaderTimeout: timeout,
		DisableKeepAlives:     true,
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	for _, t := range targets {
		for attempt := 1; attempt <= maxRetries; attempt++ {
			req, err := http.NewRequest(http.MethodGet, t, nil)
			if err == nil {
				req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
				req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
				resp, err := client.Do(req)
				if err == nil {
					statusCode = resp.StatusCode
					if resp.Body != nil {
						_, _ = io.CopyN(io.Discard, resp.Body, 2048)
						resp.Body.Close()
					}
					// Any HTTP code < 500 means the server is reachable and active.
					// Only 502/503/504 represent gateway/downstream outages.
					if statusCode > 0 && statusCode != 502 && statusCode != 503 && statusCode != 504 {
						return true, statusCode
					}
				}
			}

			if attempt < maxRetries {
				time.Sleep(time.Duration(1000*attempt) * time.Millisecond)
			}
		}
	}

	return false, statusCode
}

// CheckServiceReachable probes a single service with 3 retries (HTTP URL or TCP port on VPS).
func CheckServiceReachable(svc models.Service, vps *models.VPS) (online bool, method string) {
	if isSwarmReplicaName(svc.Name) || (svc.URL != nil && isSwarmReplicaName(*svc.URL)) {
		return false, "skip"
	}
	if svc.URL != nil && strings.TrimSpace(*svc.URL) != "" {
		isOnline, _ := CheckHTTPHealthFast(*svc.URL, 3, 10*time.Second)
		return isOnline, "http"
	}
	if svc.Port != nil && *svc.Port > 0 && vps != nil && vps.IPAddress != "" {
		return CheckPortOpenWithRetries(vps.IPAddress, *svc.Port, 3, 5*time.Second), "tcp"
	}
	return false, "skip"
}

// RunServiceHealthChecks probes all services concurrently, updates DB, notifies only on confirmed outages (2+ consecutive cycles).
func RunServiceHealthChecks(db *gorm.DB, cfg *config.Config) []ServiceHealthResult {
	var services []models.Service
	db.Preload("VPS").Preload("Client").Find(&services)

	now := time.Now()
	results := make([]ServiceHealthResult, 0, len(services))
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Concurrency limiter (max 10 simultaneous probes)
	sem := make(chan struct{}, 10)

	for _, svc := range services {
		wg.Add(1)
		go func(s models.Service) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			if isSwarmReplicaName(s.Name) || (s.URL != nil && isSwarmReplicaName(*s.URL)) {
				db.Delete(&s)
				return
			}

			oldStatus := normalizeServiceStatus(s.Status)
			online, method := CheckServiceReachable(s, s.VPS)

			if method == "skip" {
				return
			}

			vpsName := ""
			if s.VPS != nil {
				vpsName = s.VPS.Name
			}
			urlStr := ""
			if s.URL != nil {
				urlStr = *s.URL
			}

			serviceStateMu.Lock()
			shouldChangeStatus := false
			shouldNotifyOffline := false
			shouldNotifyRecovery := false
			newStatus := oldStatus

			if online {
				wasAlerted := serviceAlertActive[s.ID]
				serviceFailures[s.ID] = 0
				serviceAlertActive[s.ID] = false
				newStatus = "running"

				if oldStatus != "running" {
					shouldChangeStatus = true
					if wasAlerted && oldStatus == "stopped" {
						shouldNotifyRecovery = true
					}
				}
			} else {
				serviceFailures[s.ID]++
				// Debounce: Require at least 2 consecutive failure cycles before marking offline / alerting
				if serviceFailures[s.ID] >= 2 {
					newStatus = "stopped"
					if oldStatus != "stopped" {
						shouldChangeStatus = true
					}
					// STRICT RULE: Only alert if the service was actively RUNNING before.
					// If it was already stopped, offline, or unknown, it is NOT a new outage!
					if oldStatus == "running" {
						lastAlert := serviceLastAlert[s.ID]
						if !serviceAlertActive[s.ID] || time.Since(lastAlert) > 1*time.Hour {
							shouldNotifyOffline = true
							serviceAlertActive[s.ID] = true
							serviceLastAlert[s.ID] = now
						}
					}
				}
			}
			serviceStateMu.Unlock()

			res := ServiceHealthResult{
				ServiceID:   s.ID,
				ServiceName: s.Name,
				OldStatus:   oldStatus,
				NewStatus:   newStatus,
				Online:      online,
				Method:      method,
				VPSName:     vpsName,
				URL:         urlStr,
			}

			mu.Lock()
			if shouldChangeStatus {
				res.Changed = true
				db.Model(&s).Updates(map[string]interface{}{
					"status":       newStatus,
					"last_checked": now,
				})
			} else {
				db.Model(&s).Update("last_checked", now)
			}

			if shouldNotifyOffline {
				notifyServiceOffline(db, cfg, s, oldStatus, vpsName, method)
			} else if shouldNotifyRecovery {
				notifyServiceRecovery(db, cfg, s, vpsName, method)
			}

			results = append(results, res)
			mu.Unlock()
		}(svc)
	}

	wg.Wait()

	// Consolidated digest of offline services instead of sending an individual email per service
	go processConsolidatedOfflineDigest(db, cfg, services)

	return results
}

type OfflineServiceSummary struct {
	ID         string
	Name       string
	Type       string
	VPSName    string
	VPSIP      string
	URL        string
	ClientName string
	Method     string
	Failures   int
}

var (
	digestMu               sync.Mutex
	lastDigestSentAt       time.Time
	lastReportedOfflineIDs = make(map[string]bool)
)

func processConsolidatedOfflineDigest(db *gorm.DB, cfg *config.Config, allServices []models.Service) {
	if cfg == nil || cfg.NotificationEmail == "" {
		return
	}

	var activeOffline []OfflineServiceSummary
	for _, s := range allServices {
		// Ignore Swarm replicas and inactive clients
		if isSwarmReplicaName(s.Name) || (s.URL != nil && isSwarmReplicaName(*s.URL)) {
			continue
		}
		if s.Client != nil && !s.Client.IsActive {
			continue
		}

		serviceStateMu.Lock()
		failures := serviceFailures[s.ID]
		isAlertActive := serviceAlertActive[s.ID]
		serviceStateMu.Unlock()

		// Only services that failed actively in the monitor (2+ failures or alert active)
		if normalizeServiceStatus(s.Status) == "stopped" && (isAlertActive || failures >= 2) {
			vpsName := "VPS"
			vpsIP := "—"
			if s.VPS != nil {
				vpsName = s.VPS.Name
				vpsIP = s.VPS.IPAddress
			}
			clientName := "—"
			if s.Client != nil {
				clientName = s.Client.Name
			}
			urlStr := "—"
			if s.URL != nil && *s.URL != "" {
				urlStr = *s.URL
			}
			activeOffline = append(activeOffline, OfflineServiceSummary{
				ID:         s.ID,
				Name:       s.Name,
				Type:       s.Type,
				VPSName:    vpsName,
				VPSIP:      vpsIP,
				URL:        urlStr,
				ClientName: clientName,
				Method:     "http/tcp",
				Failures:   failures,
			})
		}
	}

	sendConsolidatedDigestEmail(db, cfg, activeOffline)
}

func sendConsolidatedDigestEmail(db *gorm.DB, cfg *config.Config, offlineList []OfflineServiceSummary) {
	if cfg == nil || cfg.NotificationEmail == "" {
		return
	}

	digestMu.Lock()
	defer digestMu.Unlock()

	now := time.Now()

	// Case 1: All services healthy
	if len(offlineList) == 0 {
		if len(lastReportedOfflineIDs) > 0 {
			subject := "🟢 RNV Monitor — Todos los servicios están ONLINE (Sistema Recuperado)"
			body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:620px;margin:0 auto;background:#131b2e;border:1px solid #1e293b;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
    <div style="background:linear-gradient(135deg,#059669,#10b981);padding:24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">🟢 Incidentes Resueltos</h1>
      <p style="margin:6px 0 0;color:#d1fae5;font-size:14px;">Todos los servicios se han recuperado y están respondiendo con normalidad.</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font-size:14px;color:#94a3b8;line-height:1.6;">
        El monitor de alta disponibilidad de <b>RNV Manager</b> confirma que no quedan servicios con fallas activas.
      </p>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://rnv.renace.tech/services" style="display:inline-block;padding:12px 24px;background:#10b981;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Ver Estado en RNV Manager</a>
      </div>
    </div>
    <div style="padding:16px;background:#0d1322;border-top:1px solid #1e293b;text-align:center;font-size:12px;color:#64748b;">
      RNV Manager · Monitor Automático de Alta Disponibilidad · RENACE.tech
    </div>
  </div>
</body>
</html>`)
			_ = SendEmail(db, cfg, cfg.NotificationEmail, subject, body)
			lastReportedOfflineIDs = make(map[string]bool)
		}
		return
	}

	// Case 2: Offline services detected
	hasNewOffline := false
	for _, item := range offlineList {
		if !lastReportedOfflineIDs[item.ID] {
			hasNewOffline = true
			break
		}
	}

	// Cooldown: only notify if new services failed OR at least 2 hours elapsed
	if !hasNewOffline && time.Since(lastDigestSentAt) < 2*time.Hour {
		return
	}

	lastDigestSentAt = now
	lastReportedOfflineIDs = make(map[string]bool)
	for _, item := range offlineList {
		lastReportedOfflineIDs[item.ID] = true
	}

	count := len(offlineList)
	subject := fmt.Sprintf("⚠️ RNV Monitor — Resumen de Incidentes (%d servicio%s offline)", count, map[bool]string{true: "s", false: ""}[count > 1])

	rowsHTML := ""
	for _, s := range offlineList {
		rowsHTML += fmt.Sprintf(`
<tr style="border-bottom:1px solid #1e293b;">
  <td style="padding:12px 8px;font-weight:600;color:#f8fafc;font-size:13px;">
    %s <span style="font-size:10px;padding:2px 6px;border-radius:6px;background:#334155;color:#94a3b8;font-weight:normal;margin-left:4px;">%s</span>
  </td>
  <td style="padding:12px 8px;color:#cbd5e1;font-size:12px;">%s <span style="color:#64748b;font-size:11px;">(%s)</span></td>
  <td style="padding:12px 8px;color:#93c5fd;font-size:12px;">%s</td>
  <td style="padding:12px 8px;font-size:11px;color:#a855f7;word-break:break-all;">%s</td>
  <td style="padding:12px 8px;text-align:right;">
    <span style="display:inline-block;padding:3px 8px;border-radius:12px;background:#ef444420;color:#f87171;border:1px solid #ef444440;font-size:11px;font-weight:600;">OFFLINE</span>
  </td>
</tr>`, s.Name, s.Type, s.VPSName, s.VPSIP, s.ClientName, s.URL)
	}

	body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:700px;margin:0 auto;background:#131b2e;border:1px solid #1e293b;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
    <div style="background:linear-gradient(135deg,#dc2626,#991b1b);padding:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">⚠️ Resumen de Servicios Offline</h1>
        <span style="background:#ffffff25;color:#ffffff;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;">%d CAÍDO%s</span>
      </div>
      <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">Se detectaron fallas de conectividad en los siguientes servicios tras múltiples verificaciones consecutivas.</p>
    </div>

    <div style="padding:20px;">
      <table style="width:100%%;border-collapse:collapse;text-align:left;">
        <thead>
          <tr style="border-bottom:2px solid #334155;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
            <th style="padding:8px;">Servicio</th>
            <th style="padding:8px;">Servidor VPS</th>
            <th style="padding:8px;">Cliente</th>
            <th style="padding:8px;">URL / Destino</th>
            <th style="padding:8px;text-align:right;">Estado</th>
          </tr>
        </thead>
        <tbody>
          %s
        </tbody>
      </table>

      <div style="margin-top:20px;padding:12px 16px;background:#1e293b60;border-radius:10px;border:1px solid #334155;font-size:12px;color:#94a3b8;line-height:1.5;">
        ℹ️ <b>Reporte Consolidado:</b> Todas las incidencias se agrupan en este resumen único para evitar saturación de correos. Recibirás una actualización si hay nuevas caídas o cuando todos los servicios se recuperen.
      </div>

      <div style="text-align:center;margin-top:24px;">
        <a href="https://rnv.renace.tech/services" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#7c3aed,#6366f1);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:13px;box-shadow:0 4px 12px rgba(124,58,237,0.3);">
          Gestionar Servicios en RNV Manager →
        </a>
      </div>
    </div>

    <div style="padding:14px;background:#0d1322;border-top:1px solid #1e293b;text-align:center;font-size:11px;color:#64748b;">
      RNV Manager · Monitor Consolidado · %s
    </div>
  </div>
</body>
</html>`, count, map[bool]string{true: "S", false: ""}[count > 1], rowsHTML, now.Format("02/01/2006 15:04:05 MST"))

	_ = SendEmail(db, cfg, cfg.NotificationEmail, subject, body)
}

func notifyServiceOffline(db *gorm.DB, cfg *config.Config, svc models.Service, oldStatus, vpsName, method string) {
	if oldStatus != "running" {
		return
	}
	meta := models.JSON{
		"serviceId": svc.ID, "serviceName": svc.Name, "type": "service_status",
		"oldStatus": oldStatus, "newStatus": "stopped", "checkMethod": method,
	}
	if svc.VpsID != nil {
		meta["vpsId"] = *svc.VpsID
	}
	if svc.URL != nil {
		meta["url"] = *svc.URL
	}

	msg := fmt.Sprintf("🔴 %s está OFFLINE", svc.Name)
	if vpsName != "" {
		msg += " · VPS " + vpsName
	}
	if svc.URL != nil && *svc.URL != "" {
		msg += " · " + strings.TrimPrefix(strings.TrimPrefix(*svc.URL, "https://"), "http://")
	}
	CreateNotification(db, "alert", "Servicio caído", msg, meta)
	// Note: Individual email alert removed in favor of consolidated digest email
}

func notifyServiceRecovery(db *gorm.DB, cfg *config.Config, svc models.Service, vpsName, method string) {
	meta := models.JSON{
		"serviceId": svc.ID, "serviceName": svc.Name, "type": "service_status",
		"oldStatus": "stopped", "newStatus": "running", "checkMethod": method,
	}
	if svc.VpsID != nil {
		meta["vpsId"] = *svc.VpsID
	}
	if svc.URL != nil {
		meta["url"] = *svc.URL
	}

	msg := fmt.Sprintf("🟢 %s volvió ONLINE", svc.Name)
	if vpsName != "" {
		msg += " · " + vpsName
	}
	CreateNotification(db, "success", "Servicio recuperado", msg, meta)
	// Note: Individual email alert removed in favor of consolidated recovery email
}

func notifyServiceStatusChange(db *gorm.DB, cfg *config.Config, svc models.Service, oldStatus, newStatus, vpsName, method string) {
	if oldStatus == "unknown" && newStatus == "running" {
		return
	}
	if newStatus == "stopped" && oldStatus != "stopped" {
		notifyServiceOffline(db, cfg, svc, oldStatus, vpsName, method)
	} else if newStatus == "running" && oldStatus == "stopped" {
		notifyServiceRecovery(db, cfg, svc, vpsName, method)
	}
}

// ListOfflineServices returns services currently down or unreachable.
func ListOfflineServices(db *gorm.DB) ([]map[string]interface{}, int) {
	var services []models.Service
	db.Preload("VPS").Preload("Client").Find(&services)
	out := make([]map[string]interface{}, 0)
	for _, s := range services {
		st := normalizeServiceStatus(s.Status)
		if st != "stopped" {
			continue
		}
		item := map[string]interface{}{
			"id": s.ID, "name": s.Name, "type": s.Type, "status": s.Status,
			"url": s.URL, "lastChecked": s.LastChecked,
		}
		if s.VPS != nil {
			item["vpsName"] = s.VPS.Name
			item["vpsIp"] = s.VPS.IPAddress
		}
		if s.Client != nil {
			item["clientName"] = s.Client.Name
		}
		out = append(out, item)
	}
	return out, len(out)
}

// ProbeServiceNow checks one service immediately and updates status if changed.
func ProbeServiceNow(db *gorm.DB, cfg *config.Config, serviceID string) (ServiceHealthResult, error) {
	var svc models.Service
	if err := db.Preload("VPS").First(&svc, "id = ?", serviceID).Error; err != nil {
		return ServiceHealthResult{}, fmt.Errorf("servicio no encontrado")
	}
	oldStatus := normalizeServiceStatus(svc.Status)
	online, method := CheckServiceReachable(svc, svc.VPS)
	if method == "skip" {
		return ServiceHealthResult{ServiceID: svc.ID, ServiceName: svc.Name, Method: "skip"}, fmt.Errorf("servicio sin URL ni puerto comprobable")
	}
	newStatus := "stopped"
	if online {
		newStatus = "running"
	}
	vpsName := ""
	if svc.VPS != nil {
		vpsName = svc.VPS.Name
	}
	res := ServiceHealthResult{
		ServiceID: svc.ID, ServiceName: svc.Name,
		OldStatus: oldStatus, NewStatus: newStatus,
		Online: online, Method: method, VPSName: vpsName,
		Changed: oldStatus != newStatus,
	}
	now := time.Now()
	db.Model(&svc).Updates(map[string]interface{}{"status": newStatus, "last_checked": now})
	if res.Changed {
		notifyServiceStatusChange(db, cfg, svc, oldStatus, newStatus, vpsName, method)
	}
	return res, nil
}

// QuickHTTPPing is a lightweight HEAD request for health checks.
func QuickHTTPPing(target string, timeout time.Duration) bool {
	client := &http.Client{Timeout: timeout}
	req, err := http.NewRequest(http.MethodHead, NormalizeURL(target), nil)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "RNV-HealthCheck/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode > 0 && resp.StatusCode < 500
}
