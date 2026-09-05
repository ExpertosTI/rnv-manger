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
	db.Preload("VPS").Find(&services)

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
					if wasAlerted {
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
					lastAlert := serviceLastAlert[s.ID]
					if !serviceAlertActive[s.ID] || time.Since(lastAlert) > 1*time.Hour {
						shouldNotifyOffline = true
						serviceAlertActive[s.ID] = true
						serviceLastAlert[s.ID] = now
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
	return results
}

func notifyServiceOffline(db *gorm.DB, cfg *config.Config, svc models.Service, oldStatus, vpsName, method string) {
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

	if cfg != nil && cfg.NotificationEmail != "" {
		body := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:520px;padding:20px">
			<h2 style="color:#dc2626">⚠️ Servicio offline</h2>
			<p><b>%s</b> no respondió tras múltiples verificaciones consecutivas (%s).</p>
			<p>VPS: %s<br>Estado anterior: %s</p>
			<p style="color:#6b7280;font-size:13px">RNV Manager — monitor de alta disponibilidad</p>
		</div>`, svc.Name, method, vpsName, oldStatus)
		_ = SendEmail(db, cfg, cfg.NotificationEmail, "RNV Alert — "+svc.Name+" OFFLINE", body)
	}
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

	if cfg != nil && cfg.NotificationEmail != "" {
		body := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:520px;padding:20px">
			<h2 style="color:#16a34a">🟢 Servicio recuperado</h2>
			<p><b>%s</b> está online y respondiendo con normalidad (%s).</p>
			<p style="color:#6b7280;font-size:13px">RNV Manager — monitor de alta disponibilidad</p>
		</div>`, svc.Name, method)
		_ = SendEmail(db, cfg, cfg.NotificationEmail, "RNV — "+svc.Name+" recuperado", body)
	}
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
