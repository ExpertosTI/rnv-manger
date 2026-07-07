package billing

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type overdueRow struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Email        *string `json:"email,omitempty"`
	Amount       float64 `json:"amount"`
	PaymentDay   int     `json:"paymentDay"`
	PaymentMonth int     `json:"paymentMonth"`
	BillingCycle string  `json:"billingCycle"`
	DaysLate     int     `json:"daysLate"`
	HasEmail     bool    `json:"hasEmail"`
}

func Overdue(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now()
		var clients []models.Client
		db.Where("is_active = true").Find(&clients)

		rows := make([]overdueRow, 0)
		for _, cl := range clients {
			overdue, daysLate, amount := serviceslayer.ClientOverdueInfo(db, cl, now)
			if !overdue {
				continue
			}
			rows = append(rows, overdueRow{
				ID: cl.ID, Name: cl.Name, Email: cl.Email,
				Amount: amount, PaymentDay: cl.PaymentDay, PaymentMonth: cl.PaymentMonth,
				BillingCycle: serviceslayer.ClientBillingCycle(cl),
				DaysLate: daysLate,
				HasEmail: cl.Email != nil && *cl.Email != "",
			})
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": rows, "count": len(rows)})
	}
}

type remindRequest struct {
	ClientID string `json:"clientId"`
	All      bool   `json:"all"`
}

func Remind(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req remindRequest
		_ = c.ShouldBindJSON(&req)
		now := time.Now()

		var targets []models.Client
		if req.All {
			db.Where("is_active = true").Find(&targets)
		} else if req.ClientID != "" {
			var cl models.Client
			if err := db.First(&cl, "id = ?", req.ClientID).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Cliente no encontrado"})
				return
			}
			targets = []models.Client{cl}
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "clientId o all requerido"})
			return
		}

		sent, skipped, failed := 0, 0, 0
		var errors []string
		for _, cl := range targets {
			overdue, daysLate, amount := serviceslayer.ClientOverdueInfo(db, cl, now)
			if !overdue || amount <= 0 {
				skipped++
				continue
			}
			if cl.Email == nil || *cl.Email == "" {
				skipped++
				continue
			}
			if err := serviceslayer.SendOverdueInvoiceEmail(db, cfg, cl, amount, daysLate); err != nil {
				failed++
				errors = append(errors, cl.Name+": "+err.Error())
				continue
			}
			serviceslayer.CreateNotification(db, "info", "Email de mora enviado",
				"Recordatorio manual a "+*cl.Email, models.JSON{
					"clientId": cl.ID, "type": "overdue_email", "daysLate": daysLate, "manual": true,
				})
			sent++
		}

		c.JSON(http.StatusOK, gin.H{
			"success": failed == 0,
			"sent":    sent,
			"skipped": skipped,
			"failed":  failed,
			"errors":  errors,
		})
	}
}
