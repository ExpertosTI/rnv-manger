package serviceslayer

import (
	"fmt"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

func overdueEmailBody(clientName string, amount float64, daysLate, paymentDay int, currency string) string {
	if currency == "" {
		currency = "USD"
	}
	return fmt.Sprintf(`
		<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
			<h2 style="color: #7c3aed; margin: 0 0 8px 0;">Renace — Recordatorio de pago</h2>
			<p style="color: #374151;">Estimado/a <b>%s</b>,</p>
			<p style="color: #374151;">Le informamos que su factura mensual de servicios se encuentra <b style="color:#dc2626;">vencida</b>.</p>
			<div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin: 20px 0;">
				<p style="margin: 0 0 8px 0; color: #6b7280;">Monto adeudado</p>
				<p style="margin: 0; font-size: 28px; font-weight: bold; color: #dc2626;">$%.2f %s</p>
				<p style="margin: 12px 0 0 0; color: #6b7280; font-size: 14px;">
					Día de pago: <b>%d</b> · Días de mora: <b>%d</b>
				</p>
			</div>
			<p style="color: #374151; font-size: 14px;">Por favor regularice su pago a la brevedad. Si ya realizó el pago, ignore este mensaje.</p>
			<p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Renace Tech — Gestión de servicios</p>
		</div>
	`, clientName, amount, currency, paymentDay, daysLate)
}

// SendOverdueInvoiceEmail notifies a client about an overdue payment.
func SendOverdueInvoiceEmail(db *gorm.DB, cfg *config.Config, cl models.Client, amount float64, daysLate int) error {
	if cl.Email == nil || *cl.Email == "" {
		return fmt.Errorf("cliente sin email")
	}
	subject := fmt.Sprintf("Recordatorio de pago vencido — %s", cl.Name)
	body := overdueEmailBody(cl.Name, amount, daysLate, cl.PaymentDay, cl.Currency)
	return SendEmail(db, cfg, *cl.Email, subject, body)
}

// ClientPaidThisMonth returns true if a completed payment exists in the current month.
func ClientPaidThisMonth(db *gorm.DB, clientID string, now time.Time) bool {
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var paid int64
	db.Model(&models.Payment{}).
		Where("client_id = ? AND status = ? AND date >= ?", clientID, "completed", monthStart).
		Count(&paid)
	return paid > 0
}

// OverdueEmailSentToday checks if we already emailed this client today about overdue.
func OverdueEmailSentToday(db *gorm.DB, clientID string, now time.Time) bool {
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var n int64
	db.Model(&models.Notification{}).
		Where("created_at >= ? AND data->>'clientId' = ? AND data->>'type' = ?",
			dayStart, clientID, "overdue_email").
		Count(&n)
	return n > 0
}

// ShouldSendOverdueReminder — escalation on days 1, 3, 7, 14 of lateness.
func ShouldSendOverdueReminder(daysLate int) bool {
	switch daysLate {
	case 1, 3, 7, 14:
		return true
	default:
		return false
	}
}

// ProcessOverdueClient handles notification + optional client email.
func ProcessOverdueClient(db *gorm.DB, cfg *config.Config, cl models.Client, now time.Time) (emailed bool, err error) {
	if cl.PaymentDay <= 0 {
		return false, nil
	}
	day := now.Day()
	if day <= cl.PaymentDay || ClientPaidThisMonth(db, cl.ID, now) {
		return false, nil
	}
	daysLate := day - cl.PaymentDay
	amount := cl.MonthlyFee + cl.TotalMonthlyCost
	if amount <= 0 {
		return false, nil
	}

	msg := fmt.Sprintf("%s adeuda $%.2f — %d días de mora", cl.Name, amount, daysLate)
	CreateNotification(db, "alert", "Pago vencido", msg, models.JSON{
		"clientId": cl.ID, "amount": amount, "daysLate": daysLate, "type": "overdue",
	})

	if !ShouldSendOverdueReminder(daysLate) || OverdueEmailSentToday(db, cl.ID, now) {
		return false, nil
	}
	if cl.Email == nil || *cl.Email == "" {
		return false, nil
	}

	if err := SendOverdueInvoiceEmail(db, cfg, cl, amount, daysLate); err != nil {
		return false, err
	}
	CreateNotification(db, "info", "Email de mora enviado", "Recordatorio enviado a "+*cl.Email, models.JSON{
		"clientId": cl.ID, "type": "overdue_email", "daysLate": daysLate,
	})
	if cfg.NotificationEmail != "" && cfg.NotificationEmail != *cl.Email {
		_ = SendEmail(db, cfg, cfg.NotificationEmail,
			"RNV — Mora enviada: "+cl.Name,
			fmt.Sprintf("<p>Recordatorio de pago enviado a <b>%s</b> ($%.2f, %d días mora)</p>", *cl.Email, amount, daysLate))
	}
	return true, nil
}
