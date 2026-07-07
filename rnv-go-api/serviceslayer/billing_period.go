package serviceslayer

import (
	"fmt"
	"time"

	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

const (
	BillingCycleMonthly = "monthly"
	BillingCycleAnnual  = "annual"
)

// ClientBillingCycle returns monthly or annual (default monthly).
func ClientBillingCycle(c models.Client) string {
	if c.BillingCycle == BillingCycleAnnual {
		return BillingCycleAnnual
	}
	return BillingCycleMonthly
}

// ClientChargeAmount is the amount due for the current billing period.
func ClientChargeAmount(c models.Client) float64 {
	if ClientBillingCycle(c) == BillingCycleAnnual {
		if c.AnnualFee > 0 {
			return c.AnnualFee
		}
		if c.MonthlyFee > 0 {
			return c.MonthlyFee * 12
		}
		return c.TotalMonthlyCost * 12
	}
	if c.TotalMonthlyCost > 0 {
		return c.TotalMonthlyCost
	}
	return c.MonthlyFee
}

// ClientDueDate returns the due date for the current period containing ref.
func ClientDueDate(c models.Client, ref time.Time) time.Time {
	day := c.PaymentDay
	if day < 1 {
		day = 1
	}
	if day > 28 {
		day = 28
	}
	if ClientBillingCycle(c) == BillingCycleAnnual {
		month := c.PaymentMonth
		if month < 1 || month > 12 {
			month = 1
		}
		return time.Date(ref.Year(), time.Month(month), day, 0, 0, 0, 0, ref.Location())
	}
	return time.Date(ref.Year(), ref.Month(), day, 0, 0, 0, 0, ref.Location())
}

// ClientPeriodStart returns start of current billing period.
func ClientPeriodStart(c models.Client, ref time.Time) time.Time {
	if ClientBillingCycle(c) == BillingCycleAnnual {
		return time.Date(ref.Year(), 1, 1, 0, 0, 0, 0, ref.Location())
	}
	return time.Date(ref.Year(), ref.Month(), 1, 0, 0, 0, 0, ref.Location())
}

// ClientPaidForPeriod returns true if client paid in the current billing period.
func ClientPaidForPeriod(db *gorm.DB, c models.Client, now time.Time) bool {
	start := ClientPeriodStart(c, now)
	var paid int64
	db.Model(&models.Payment{}).
		Where("client_id = ? AND status = ? AND date >= ?", c.ID, "completed", start).
		Count(&paid)
	return paid > 0
}

// ClientPaidThisMonth — compat wrapper.
func ClientPaidThisMonth(db *gorm.DB, clientID string, now time.Time) bool {
	var c models.Client
	if db.First(&c, "id = ?", clientID).Error != nil {
		return false
	}
	return ClientPaidForPeriod(db, c, now)
}

// ClientOverdueInfo returns overdue status and days late.
func ClientOverdueInfo(db *gorm.DB, c models.Client, now time.Time) (overdue bool, daysLate int, amount float64) {
	amount = ClientChargeAmount(c)
	if amount <= 0 || c.PaymentDay <= 0 {
		return false, 0, amount
	}
	if ClientPaidForPeriod(db, c, now) {
		return false, 0, amount
	}
	due := ClientDueDate(c, now)
	if now.Before(due) {
		return false, 0, amount
	}
	daysLate = int(now.Sub(due).Hours() / 24)
	if daysLate < 1 {
		daysLate = 1
	}
	return true, daysLate, amount
}

// ClientDueToday returns true if today is the payment due date and not yet paid.
func ClientDueToday(db *gorm.DB, c models.Client, now time.Time) bool {
	if c.PaymentDay <= 0 || ClientPaidForPeriod(db, c, now) {
		return false
	}
	due := ClientDueDate(c, now)
	return now.Year() == due.Year() && now.Month() == due.Month() && now.Day() == due.Day()
}

// BillingCycleLabel for UI/emails.
func BillingCycleLabel(c models.Client) string {
	if ClientBillingCycle(c) == BillingCycleAnnual {
		return "anual"
	}
	return "mensual"
}

// FormatDueDescription human-readable due info.
func FormatDueDescription(c models.Client) string {
	if ClientBillingCycle(c) == BillingCycleAnnual {
		months := []string{"", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"}
		m := c.PaymentMonth
		if m < 1 || m > 12 {
			m = 1
		}
		return fmt.Sprintf("%d %s (anual)", c.PaymentDay, months[m])
	}
	return fmt.Sprintf("día %d (mensual)", c.PaymentDay)
}
