package scheduler

import (
	"log"
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
		go checkAllVPS(db)
	}
}

func checkAllVPS(db *gorm.DB) {
	var vpsList []models.VPS
	db.Find(&vpsList)

	for _, vps := range vpsList {
		go func(v models.VPS) {
			// Check SSH port availability
			sshAlive := serviceslayer.CheckPortOpen(v.IPAddress, v.SSHPort, 5)
			status := "offline"
			if sshAlive {
				status = "online"
			}

			if v.Status != status {
				db.Model(&v).Update("status", status)
				notifType := "success"
				notifMsg := "VPS " + v.Name + " está online"
				if status == "offline" {
					notifType = "alert"
					notifMsg = "VPS " + v.Name + " está OFFLINE - " + v.IPAddress
				}
				serviceslayer.CreateNotification(db, notifType, "Estado VPS", notifMsg, models.JSON{
					"vpsId":  v.ID,
					"vpsIP":  v.IPAddress,
					"status": status,
				})
				log.Printf("[Monitor] VPS %s (%s) status changed to %s", v.Name, v.IPAddress, status)
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
