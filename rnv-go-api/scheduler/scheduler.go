package scheduler

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

// StartMonitorScheduler checks all VPS health every 5 minutes
func StartMonitorScheduler(db *gorm.DB, cfg *config.Config) {
	log.Println("[Scheduler] VPS monitor started (interval: 5m)")
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		go checkAllVPS(db, cfg)
	}
}

var (
	vpsStateMu     sync.Mutex
	vpsFailures    = make(map[string]int)
	vpsAlertActive = make(map[string]bool)
)

func checkAllVPS(db *gorm.DB, cfg *config.Config) {
	var vpsList []models.VPS
	db.Find(&vpsList)

	for _, vps := range vpsList {
		go func(v models.VPS) {
			// Check SSH port availability with 3 retries
			sshAlive := serviceslayer.CheckPortOpenWithRetries(v.IPAddress, v.SSHPort, 3, 5*time.Second)

			vpsStateMu.Lock()
			shouldUpdate := false
			status := v.Status
			shouldAlertOffline := false
			shouldAlertOnline := false

			if sshAlive {
				wasAlerted := vpsAlertActive[v.ID]
				vpsFailures[v.ID] = 0
				vpsAlertActive[v.ID] = false
				if v.Status != "online" {
					status = "online"
					shouldUpdate = true
					if wasAlerted && v.Status == "offline" {
						shouldAlertOnline = true
					}
				}
			} else {
				vpsFailures[v.ID]++
				if vpsFailures[v.ID] >= 2 {
					if v.Status != "offline" {
						status = "offline"
						shouldUpdate = true
					}
					if !vpsAlertActive[v.ID] {
						shouldAlertOffline = true
						vpsAlertActive[v.ID] = true
					}
				}
			}
			vpsStateMu.Unlock()

			if shouldUpdate {
				db.Model(&v).Update("status", status)
				log.Printf("[Monitor] VPS %s (%s) status changed to %s", v.Name, v.IPAddress, status)
			}

			if shouldAlertOffline {
				notifMsg := "VPS " + v.Name + " está OFFLINE - " + v.IPAddress
				serviceslayer.CreateNotification(db, "alert", "Estado VPS", notifMsg, models.JSON{
					"vpsId":  v.ID,
					"vpsIP":  v.IPAddress,
					"status": "offline",
				})
				if cfg != nil && cfg.NotificationEmail != "" {
					body := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:520px;padding:20px">
						<h2 style="color:#dc2626">Estado VPS</h2>
						<p><b>%s</b> (%s) → <b>OFFLINE</b> tras múltiples intentos.</p>
						<p style="color:#6b7280;font-size:13px">RNV Manager — monitor automático</p>
					</div>`, v.Name, v.IPAddress)
					subj := "RNV — VPS " + v.Name + " OFFLINE"
					_ = serviceslayer.SendEmail(db, cfg, cfg.NotificationEmail, subj, body)
				}
			} else if shouldAlertOnline {
				notifMsg := "VPS " + v.Name + " está online"
				serviceslayer.CreateNotification(db, "success", "Estado VPS", notifMsg, models.JSON{
					"vpsId":  v.ID,
					"vpsIP":  v.IPAddress,
					"status": "online",
				})
				if cfg != nil && cfg.NotificationEmail != "" {
					body := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:520px;padding:20px">
						<h2 style="color:#16a34a">Estado VPS</h2>
						<p><b>%s</b> (%s) → <b>ONLINE</b> y respondiendo.</p>
						<p style="color:#6b7280;font-size:13px">RNV Manager — monitor automático</p>
					</div>`, v.Name, v.IPAddress)
					subj := "RNV — VPS " + v.Name + " ONLINE"
					_ = serviceslayer.SendEmail(db, cfg, cfg.NotificationEmail, subj, body)
				}
			}
		}(vps)
	}
}

// StartCleanupScheduler removes old sessions and read notifications
func StartCleanupScheduler(db *gorm.DB) {
	log.Println("[Scheduler] Cleanup scheduler started (interval: 24h)")
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		go func() {
			// Delete expired sessions
			result := db.Where("expires_at < ?", time.Now()).Delete(&models.Session{})
			log.Printf("[Cleanup] Deleted %d expired sessions", result.RowsAffected)

			// Delete old read notifications (older than 30 days)
			result = db.Where("is_read = true AND created_at < ?", time.Now().AddDate(0, -1, 0)).
				Delete(&models.Notification{})
			log.Printf("[Cleanup] Deleted %d old notifications", result.RowsAffected)

			// Delete expired/used OTP codes (older than 1 hour)
			result = db.Where("expires_at < ? OR used = true", time.Now().Add(-1*time.Hour)).
				Delete(&models.OTPCode{})
			log.Printf("[Cleanup] Deleted %d expired/used OTP codes", result.RowsAffected)
		}()
	}
}
