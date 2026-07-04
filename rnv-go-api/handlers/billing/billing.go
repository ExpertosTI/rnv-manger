package billing

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

type clientBillingRow struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	OdooPartnerID    *int    `json:"odooPartnerId"`
	VPSCost          float64 `json:"vpsCost"`
	ServiceCost      float64 `json:"serviceCost"`
	BaseFee          float64 `json:"baseFee"`
	TotalMonthlyCost float64 `json:"totalMonthlyCost"`
	VPSCount         int     `json:"vpsCount"`
	ServiceCount     int     `json:"serviceCount"`
	CanInvoice       bool    `json:"canInvoice"`
}

func Summary(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var clients []models.Client
		db.Where("is_active = true").
			Preload("VPSList").Preload("Services").
			Preload("Payments", func(db *gorm.DB) *gorm.DB {
				return db.Order("date desc").Limit(3)
			}).Order("name asc").Find(&clients)

		var totalRevenue, totalExpenses float64
		var clientsWithOdoo int64
		db.Model(&models.VPS{}).Select("COALESCE(SUM(monthly_cost),0)").Scan(&totalExpenses)

		rows := make([]clientBillingRow, 0, len(clients))
		for _, cl := range clients {
			var vpsCost, svcCost float64
			for _, v := range cl.VPSList {
				vpsCost += v.MonthlyCost
			}
			for _, s := range cl.Services {
				svcCost += s.MonthlyCost
			}
			total := cl.MonthlyFee + vpsCost + svcCost
			totalRevenue += total
			if cl.OdooPartnerID != nil {
				clientsWithOdoo++
			}
			rows = append(rows, clientBillingRow{
				ID:               cl.ID,
				Name:             cl.Name,
				OdooPartnerID:    cl.OdooPartnerID,
				VPSCost:          vpsCost,
				ServiceCost:      svcCost,
				BaseFee:          cl.MonthlyFee,
				TotalMonthlyCost: total,
				VPSCount:         len(cl.VPSList),
				ServiceCount:     len(cl.Services),
				CanInvoice:       cl.OdooPartnerID != nil && total > 0,
			})
		}

		now := time.Now()
		dayOfMonth := now.Day()
		var upcomingPayments []models.Client
		db.Where("is_active = true AND payment_day BETWEEN ? AND ?",
			dayOfMonth, dayOfMonth+5).Find(&upcomingPayments)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    rows,
			"totals": gin.H{
				"clients":             len(clients),
				"totalMonthlyRevenue": totalRevenue,
				"clientsWithOdoo":     clientsWithOdoo,
				"totalRevenue":        totalRevenue,
				"totalExpenses":       totalExpenses,
				"netProfit":           totalRevenue - totalExpenses,
				"clientCount":         len(clients),
				"upcomingPayments":    upcomingPayments,
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
