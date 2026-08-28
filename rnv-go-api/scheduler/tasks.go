package scheduler

import (
	"fmt"
	"log"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

// StartTaskScheduler fires pending scheduled tasks (reminders, reactivations, etc.)
func StartTaskScheduler(db *gorm.DB, cfg *config.Config) {
	log.Println("[Scheduler] Task scheduler started (interval: 1m)")
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	runPendingTasks(db, cfg)

	for range ticker.C {
		go runPendingTasks(db, cfg)
	}
}

func runPendingTasks(db *gorm.DB, cfg *config.Config) {
	now := time.Now()
	var tasks []models.ScheduledTask
	db.Preload("Client").Preload("Service").
		Where("status = ? AND scheduled_at <= ?", "pending", now).
		Order("scheduled_at asc").
		Limit(50).
		Find(&tasks)

	for _, task := range tasks {
		processTask(db, cfg, task)
	}
}

func processTask(db *gorm.DB, cfg *config.Config, task models.ScheduledTask) {
	msg := task.Title
	if task.Description != nil && *task.Description != "" {
		msg = *task.Description
	}

	notifType := "info"
	if task.Type == "billing" || task.Type == "reactivation" {
		notifType = "warning"
	}

	meta := models.JSON{
		"taskId": task.ID, "type": "scheduled_task", "taskType": task.Type,
	}
	if task.ClientID != nil {
		meta["clientId"] = *task.ClientID
	}

	serviceslayer.CreateNotification(db, notifType, "📅 "+task.Title, msg, meta)

	// Send WhatsApp notification
	whatsappTarget := cfg.WhatsAppOwnerNumber
	if whatsappTarget == "" {
		whatsappTarget = cfg.WhatsAppNotifyNumbers
	}
	if task.Client != nil && task.Client.Phone != nil && *task.Client.Phone != "" {
		whatsappTarget = *task.Client.Phone
	}
	if whatsappTarget != "" {
		waText := fmt.Sprintf("⏰ *RECORDATORIO DE COMPROMISO RNV*\n\n📌 *%s*\n🕒 *Hora:* %s\n", task.Title, task.ScheduledAt.Format("03:04 PM"))
		if task.Client != nil {
			waText += fmt.Sprintf("👥 *Cliente:* %s\n", task.Client.Name)
		}
		if task.Description != nil && *task.Description != "" {
			waText += fmt.Sprintf("📝 *Detalles:* %s\n", *task.Description)
		}
		waText += "\n🌐 https://rnv.renace.tech/calendar"
		_ = serviceslayer.SendWhatsApp(db, cfg, whatsappTarget, waText)
	}

	if task.NotifyEmail && cfg.NotificationEmail != "" {
		body := fmt.Sprintf("<p><b>%s</b></p><p>%s</p>", task.Title, msg)
		if task.Client != nil && task.Client.Email != nil && *task.Client.Email != "" {
			_ = serviceslayer.SendEmail(db, cfg, *task.Client.Email, "RNV — "+task.Title, body)
		}
		_ = serviceslayer.SendEmail(db, cfg, cfg.NotificationEmail, "RNV — Recordatorio: "+task.Title, body)
	}

	db.Model(&task).Updates(map[string]interface{}{
		"status":     "done",
		"updated_at": time.Now(),
	})
	log.Printf("[Tasks] Executed: %s (%s)", task.Title, task.Type)
}
