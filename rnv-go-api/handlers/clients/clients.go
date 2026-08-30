package clients

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

func List(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var clientList []models.Client
		db.Preload("VPSList.Services").Preload("Services").
			Preload("Payments", func(db *gorm.DB) *gorm.DB {
				return db.Order("date desc").Limit(5)
			}).Order("created_at desc").Find(&clientList)

		type EnrichedClient struct {
			models.Client
			CalculatedCosts gin.H      `json:"calculatedCosts"`
			SyncedWithOdoo  bool       `json:"syncedWithOdoo"`
			IsOverdue       bool       `json:"isOverdue"`
			DaysLate        int        `json:"daysLate"`
			AmountDue       float64    `json:"amountDue"`
			PaidThisPeriod  bool       `json:"paidThisPeriod"`
			BillingStatus   string     `json:"billingStatus"`
			HealthIssues    []string   `json:"healthIssues"`
			LastPaymentDate *string    `json:"lastPaymentDate,omitempty"`
			ServiceCount    int        `json:"serviceCount"`
			VPSCount        int        `json:"vpsCount"`
		}

		now := time.Now()
		var enriched []EnrichedClient
		for _, cl := range clientList {
			vpsCost := 0.0
			for _, v := range cl.VPSList {
				vpsCost += v.MonthlyCost
			}
			svcCost := 0.0
			for _, s := range cl.Services {
				svcCost += s.MonthlyCost
			}
			total := vpsCost + svcCost + cl.MonthlyFee

			paidThisPeriod := serviceslayer.ClientPaidForPeriod(db, cl, now)
			isOverdue, daysLate, amountDue := serviceslayer.ClientOverdueInfo(db, cl, now)
			isDueToday := serviceslayer.ClientDueToday(db, cl, now)

			billingStatus := "pending"
			if !cl.IsActive {
				billingStatus = "inactive"
			} else if total <= 0 && cl.AnnualFee <= 0 {
				billingStatus = "unconfigured"
			} else if paidThisPeriod {
				billingStatus = "paid"
			} else if isOverdue {
				billingStatus = "overdue"
			} else if isDueToday {
				billingStatus = "due_today"
			}

			var healthIssues []string
			if (cl.Email == nil || *cl.Email == "") && (cl.Phone == nil || *cl.Phone == "") {
				healthIssues = append(healthIssues, "sin_contacto")
			}
			if len(cl.Services) == 0 && len(cl.VPSList) == 0 {
				healthIssues = append(healthIssues, "sin_servicios")
			}
			if (len(cl.Services) > 0 || len(cl.VPSList) > 0) && total <= 0 && cl.AnnualFee <= 0 {
				healthIssues = append(healthIssues, "tarifa_cero")
			}
			if cl.OdooPartnerID == nil {
				healthIssues = append(healthIssues, "sin_odoo")
			}
			if isOverdue {
				healthIssues = append(healthIssues, "en_mora")
			}

			var lastPayDate *string
			if len(cl.Payments) > 0 {
				formatted := cl.Payments[0].Date.Format("2006-01-02")
				lastPayDate = &formatted
			}

			enriched = append(enriched, EnrichedClient{
				Client: cl,
				CalculatedCosts: gin.H{
					"vps":      vpsCost,
					"services": svcCost,
					"baseFee":  cl.MonthlyFee,
					"total":    total,
				},
				SyncedWithOdoo:  cl.OdooPartnerID != nil,
				IsOverdue:       isOverdue,
				DaysLate:        daysLate,
				AmountDue:       amountDue,
				PaidThisPeriod:  paidThisPeriod,
				BillingStatus:   billingStatus,
				HealthIssues:    healthIssues,
				LastPaymentDate: lastPayDate,
				ServiceCount:    len(cl.Services),
				VPSCount:        len(cl.VPSList),
			})
		}
		if enriched == nil {
			enriched = []EnrichedClient{}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": enriched})
	}
}

func Create(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var client models.Client
		if err := c.ShouldBindJSON(&client); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if err := db.Create(&client).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "CREATE", "client", "Cliente creado: "+client.Name,
			models.JSON{"clientId": client.ID}, ip, userID)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": client})
	}
}

func Get(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var client models.Client
		if err := db.Preload("VPSList.Services").Preload("Services").
			Preload("Payments", func(db *gorm.DB) *gorm.DB {
				return db.Order("date desc")
			}).First(&client, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Cliente no encontrado"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": client})
	}
}

func Update(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var client models.Client
		if err := db.First(&client, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Cliente no encontrado"})
			return
		}
		if err := c.ShouldBindJSON(&client); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		client.ID = id
		db.Save(&client)
		serviceslayer.RecalculateClientCost(db, id)
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "UPDATE", "client", "Cliente actualizado: "+client.Name,
			models.JSON{"clientId": id}, ip, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": client})
	}
}

func Delete(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var client models.Client
		if err := db.First(&client, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Cliente no encontrado"})
			return
		}
		db.Delete(&client)
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "DELETE", "client", "Cliente eliminado: "+client.Name,
			models.JSON{"clientId": id}, ip, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Cliente eliminado"})
	}
}
