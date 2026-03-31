package stats

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

func Dashboard(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var totalClients, activeClients, totalVPS, totalServices int64
		var totalRevenue, totalExpenses float64

		db.Model(&models.Client{}).Count(&totalClients)
		db.Model(&models.Client{}).Where("is_active = true").Count(&activeClients)
		db.Model(&models.VPS{}).Count(&totalVPS)
		db.Model(&models.Service{}).Count(&totalServices)

		db.Model(&models.Client{}).
			Select("COALESCE(SUM(monthly_fee + total_monthly_cost), 0)").
			Where("is_active = true").
			Scan(&totalRevenue)

		db.Model(&models.VPS{}).
			Select("COALESCE(SUM(monthly_cost), 0)").
			Scan(&totalExpenses)

		// Monthly revenue from history
		now := time.Now()
		var history []models.RevenueHistory
		db.Where("year = ? AND month BETWEEN ? AND ?", now.Year(), 1, int(now.Month())).
			Order("month asc").Find(&history)

		// Recent audit activity
		var recentActivity []models.AuditLog
		db.Preload("User").Order("created_at desc").Limit(5).Find(&recentActivity)

		// VPS status distribution
		type StatusCount struct {
			Status string `json:"status"`
			Count  int64  `json:"count"`
		}
		var vpsStatus []StatusCount
		db.Model(&models.VPS{}).Select("status, count(*) as count").Group("status").Scan(&vpsStatus)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"totals": gin.H{
					"clients":        totalClients,
					"activeClients":  activeClients,
					"vps":            totalVPS,
					"services":       totalServices,
					"monthlyRevenue": totalRevenue,
					"monthlyExpense": totalExpenses,
					"netProfit":      totalRevenue - totalExpenses,
				},
				"revenueHistory": history,
				"recentActivity": recentActivity,
				"vpsStatus":      vpsStatus,
			},
		})
	}
}
