package billing

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

func Summary(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var clients []models.Client
		db.Where("is_active = true").
			Preload("VPSList").Preload("Services").
			Preload("Payments", func(db *gorm.DB) *gorm.DB {
				return db.Order("date desc").Limit(3)
			}).Find(&clients)

		var totalRevenue, totalExpenses float64
		db.Model(&models.VPS{}).Select("COALESCE(SUM(monthly_cost),0)").Scan(&totalExpenses)

		for _, cl := range clients {
			totalRevenue += cl.MonthlyFee + cl.TotalMonthlyCost
		}

		// Clients with upcoming payment (within next 5 days)
		now := time.Now()
		dayOfMonth := now.Day()
		var upcomingPayments []models.Client
		db.Where("is_active = true AND payment_day BETWEEN ? AND ?",
			dayOfMonth, dayOfMonth+5).Find(&upcomingPayments)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"totalRevenue":    totalRevenue,
				"totalExpenses":   totalExpenses,
				"netProfit":       totalRevenue - totalExpenses,
				"clientCount":     len(clients),
				"upcomingPayments": upcomingPayments,
			},
		})
	}
}

func CreatePayment(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var payment models.Payment
		if err := c.ShouldBindJSON(&payment); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if payment.Date.IsZero() {
			payment.Date = time.Now()
		}
		if err := db.Create(&payment).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": payment})
	}
}
