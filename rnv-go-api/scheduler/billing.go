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

// StartBillingScheduler — cobros recurrentes: alertas de vencimiento y mora
func StartBillingScheduler(db *gorm.DB, cfg *config.Config) {
	log.Println("[Scheduler] Billing reminders started (interval: 6h)")
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()

	runBillingChecks(db, cfg)

	for range ticker.C {
		go runBillingChecks(db, cfg)
	}
}

func runBillingChecks(db *gorm.DB, cfg *config.Config) {
	now := time.Now()
	day := now.Day()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	var clients []models.Client
	db.Where("is_active = true").Find(&clients)

	for _, cl := range clients {
		if cl.PaymentDay <= 0 {
			continue
		}

		// Pago ya registrado este mes
		var paid int64
		db.Model(&models.Payment{}).
			Where("client_id = ? AND status = ? AND date >= ?", cl.ID, "completed", monthStart).
			Count(&paid)
		if paid > 0 {
			continue
		}

		amount := cl.MonthlyFee + cl.TotalMonthlyCost
		if amount <= 0 {
			continue
		}

		// Hoy es día de cobro
		if day == cl.PaymentDay {
			msg := fmt.Sprintf("Cobro mensual de %s: $%.2f (día %d)", cl.Name, amount, cl.PaymentDay)
			serviceslayer.CreateNotification(db, "info", "Cobro recurrente", msg, models.JSON{
				"clientId": cl.ID, "amount": amount, "type": "due_today",
			})
			if cfg.NotificationEmail != "" {
				_ = serviceslayer.SendEmail(db, cfg, cfg.NotificationEmail,
					"RNV — Cobro hoy: "+cl.Name,
					fmt.Sprintf("<p>Cliente <b>%s</b> — monto <b>$%.2f</b></p>", cl.Name, amount))
			}
		}

		// Mora (pasó el día de pago)
		if day > cl.PaymentDay {
			if _, err := serviceslayer.ProcessOverdueClient(db, cfg, cl, now); err != nil {
				log.Printf("[Billing] overdue email %s: %v", cl.Name, err)
			}
		}
	}

	// Snapshot mensual el día 1
	if day == 1 {
		snapshotMonthlyRevenue(db)
	}
}

func snapshotMonthlyRevenue(db *gorm.DB) {
	now := time.Now()
	var revenue, expenses float64
	var clientCount, vpsCount, svcCount int64

	db.Model(&models.Client{}).Where("is_active = true").Count(&clientCount)
	db.Model(&models.VPS{}).Count(&vpsCount)
	db.Model(&models.Service{}).Count(&svcCount)
	db.Model(&models.Client{}).Where("is_active = true").
		Select("COALESCE(SUM(monthly_fee + total_monthly_cost),0)").Scan(&revenue)
	db.Model(&models.VPS{}).Select("COALESCE(SUM(monthly_cost),0)").Scan(&expenses)

	var existing models.RevenueHistory
	err := db.Where("year = ? AND month = ?", now.Year(), int(now.Month())).First(&existing).Error
	if err == nil {
		db.Model(&existing).Updates(map[string]interface{}{
			"revenue": revenue, "expenses": expenses,
			"clients": clientCount, "vps": vpsCount, "services": svcCount,
		})
		return
	}

	db.Create(&models.RevenueHistory{
		Year: now.Year(), Month: int(now.Month()),
		Revenue: revenue, Expenses: expenses,
		Clients: int(clientCount), VPS: int(vpsCount), Services: int(svcCount),
	})
}
