package serviceslayer

import (
	"fmt"
	"net/http"
	"strings"
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

// CheckServiceReachable probes a single service (HTTP URL or TCP port on VPS).
func CheckServiceReachable(svc models.Service, vps *models.VPS) (online bool, method string) {
	if svc.URL != nil && strings.TrimSpace(*svc.URL) != "" {
		pr := ProbeURL(*svc.URL)
		return pr.Reachable && pr.StatusCode > 0 && pr.StatusCode < 500, "http"
	}
	if svc.Port != nil && *svc.Port > 0 && vps != nil && vps.IPAddress != "" {
		return CheckPortOpen(vps.IPAddress, *svc.Port, 5), "tcp"
	}
	return false, "skip"
}

// RunServiceHealthChecks probes all services, updates DB, notifies on status change.
func RunServiceHealthChecks(db *gorm.DB, cfg *config.Config) []ServiceHealthResult {
	var services []models.Service
	db.Preload("VPS").Find(&services)

	now := time.Now()
	results := make([]ServiceHealthResult, 0, len(services))

	for _, svc := range services {
		oldStatus := normalizeServiceStatus(svc.Status)
		online, method := CheckServiceReachable(svc, svc.VPS)

		if method == "skip" {
			continue
		}

		newStatus := "stopped"
		if online {
			newStatus = "running"
		}

		vpsName := ""
		if svc.VPS != nil {
			vpsName = svc.VPS.Name
		}
		urlStr := ""
		if svc.URL != nil {
			urlStr = *svc.URL
		}

		res := ServiceHealthResult{
			ServiceID: svc.ID, ServiceName: svc.Name,
			OldStatus: oldStatus, NewStatus: newStatus,
			Online: online, Method: method, VPSName: vpsName, URL: urlStr,
		}

		if oldStatus != newStatus {
			res.Changed = true
			db.Model(&svc).Updates(map[string]interface{}{
				"status":       newStatus,
				"last_checked": now,
			})
			notifyServiceStatusChange(db, cfg, svc, oldStatus, newStatus, vpsName, method)
		} else {
			db.Model(&svc).Update("last_checked", now)
		}

		results = append(results, res)
	}
	return results
}

func notifyServiceStatusChange(db *gorm.DB, cfg *config.Config, svc models.Service, oldStatus, newStatus, vpsName, method string) {
	meta := models.JSON{
		"serviceId": svc.ID, "serviceName": svc.Name, "type": "service_status",
		"oldStatus": oldStatus, "newStatus": newStatus, "checkMethod": method,
	}
	if svc.VpsID != nil {
		meta["vpsId"] = *svc.VpsID
	}
	if svc.URL != nil {
		meta["url"] = *svc.URL
	}

	if newStatus == "stopped" {
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
				<p><b>%s</b> dejó de responder (%s).</p>
				<p>VPS: %s<br>Estado anterior: %s</p>
				<p style="color:#6b7280;font-size:13px">RNV Manager — monitor automático</p>
			</div>`, svc.Name, method, vpsName, oldStatus)
			_ = SendEmail(db, cfg, cfg.NotificationEmail, "RNV Alert — "+svc.Name+" OFFLINE", body)
		}
		return
	}

	if newStatus == "running" && (oldStatus == "stopped" || oldStatus == "unknown") {
		msg := fmt.Sprintf("🟢 %s volvió ONLINE", svc.Name)
		if vpsName != "" {
			msg += " · " + vpsName
		}
		CreateNotification(db, "success", "Servicio recuperado", msg, meta)

		if cfg != nil && cfg.NotificationEmail != "" && oldStatus == "stopped" {
			body := fmt.Sprintf(`<p><b>%s</b> está online de nuevo (%s).</p>`, svc.Name, method)
			_ = SendEmail(db, cfg, cfg.NotificationEmail, "RNV — "+svc.Name+" recuperado", body)
		}
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
