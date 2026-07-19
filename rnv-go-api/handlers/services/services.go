package services

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

func List(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var svcs []models.Service
		db.Preload("VPS").Preload("Client").Order("created_at desc").Find(&svcs)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": svcs, "count": len(svcs)})
	}
}

func Create(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var svc models.Service
		if err := c.ShouldBindJSON(&svc); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		serviceslayer.EnrichServiceIcon(&svc)
		if err := db.Create(&svc).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		if svc.ClientID != nil {
			serviceslayer.RecalculateClientCost(db, *svc.ClientID)
		}
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "CREATE", "service", "Servicio creado: "+svc.Name,
			models.JSON{"serviceId": svc.ID}, ip, userID)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": svc})
	}
}

func Get(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var svc models.Service
		if err := db.Preload("VPS").Preload("Client").First(&svc, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Servicio no encontrado"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": svc})
	}
}

func Update(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var svc models.Service
		if err := db.First(&svc, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Servicio no encontrado"})
			return
		}
		oldClientID := svc.ClientID
		if err := c.ShouldBindJSON(&svc); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		svc.ID = id
		serviceslayer.EnrichServiceIcon(&svc)
		db.Save(&svc)
		if svc.ClientID != nil {
			serviceslayer.RecalculateClientCost(db, *svc.ClientID)
		}
		if oldClientID != nil && (svc.ClientID == nil || *oldClientID != *svc.ClientID) {
			serviceslayer.RecalculateClientCost(db, *oldClientID)
		}
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "UPDATE", "service", "Servicio actualizado: "+svc.Name,
			models.JSON{"serviceId": id}, ip, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": svc})
	}
}

type bulkOrgItem struct {
	ID          string   `json:"id"`
	ClientID    *string  `json:"clientId"`
	Purpose     *string  `json:"purpose"`
	MonthlyCost *float64 `json:"monthlyCost"`
}

type bulkOrgRequest struct {
	Items []bulkOrgItem `json:"items" binding:"required"`
}

// BulkOrganize updates client/purpose/monthlyCost for many services in one request.
func BulkOrganize(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req bulkOrgRequest
		if err := c.ShouldBindJSON(&req); err != nil || len(req.Items) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "items requerido"})
			return
		}
		updated := 0
		failed := 0
		touchedClients := map[string]bool{}
		for _, item := range req.Items {
			if item.ID == "" {
				failed++
				continue
			}
			var svc models.Service
			if err := db.First(&svc, "id = ?", item.ID).Error; err != nil {
				failed++
				continue
			}
			if svc.ClientID != nil {
				touchedClients[*svc.ClientID] = true
			}
			updates := map[string]interface{}{}
			if item.ClientID != nil {
				if *item.ClientID == "" {
					updates["client_id"] = nil
				} else {
					updates["client_id"] = *item.ClientID
					touchedClients[*item.ClientID] = true
				}
			}
			if item.Purpose != nil {
				updates["purpose"] = *item.Purpose
			}
			if item.MonthlyCost != nil {
				updates["monthly_cost"] = *item.MonthlyCost
				updates["billing_cycle"] = "monthly"
			}
			if len(updates) == 0 {
				continue
			}
			if err := db.Model(&svc).Updates(updates).Error; err != nil {
				failed++
				continue
			}
			updated++
		}
		for clientID := range touchedClients {
			serviceslayer.RecalculateClientCost(db, clientID)
		}
		serviceslayer.LogAudit(db, "UPDATE", "service",
			fmt.Sprintf("Organización masiva: %d ok, %d fallos", updated, failed),
			models.JSON{"updated": updated, "failed": failed},
			middleware.GetClientIP(c), middleware.GetUserID(c))
		c.JSON(http.StatusOK, gin.H{"success": true, "updated": updated, "failed": failed})
	}
}

func Delete(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var svc models.Service
		if err := db.First(&svc, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Servicio no encontrado"})
			return
		}
		clientID := svc.ClientID
		db.Delete(&svc)
		if clientID != nil {
			serviceslayer.RecalculateClientCost(db, *clientID)
		}
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "DELETE", "service", "Servicio eliminado: "+svc.Name,
			models.JSON{"serviceId": id}, ip, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Servicio eliminado"})
	}
}

func ListTasks(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var tasks []models.ScheduledTask
		q := db.Where("service_id = ?", id).Preload("Client").Order("scheduled_at asc")
		if status := c.Query("status"); status != "" {
			q = q.Where("status = ?", status)
		}
		q.Limit(100).Find(&tasks)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": tasks, "count": len(tasks)})
	}
}

func Import(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Returns available service types for import reference
		serviceTypes := []gin.H{
			{"type": "nginx", "name": "Nginx", "defaultPort": 80},
			{"type": "postgres", "name": "PostgreSQL", "defaultPort": 5432},
			{"type": "mysql", "name": "MySQL", "defaultPort": 3306},
			{"type": "redis", "name": "Redis", "defaultPort": 6379},
			{"type": "docker", "name": "Docker", "defaultPort": nil},
			{"type": "odoo", "name": "Odoo", "defaultPort": 8069},
			{"type": "nodejs", "name": "Node.js", "defaultPort": 3000},
			{"type": "python", "name": "Python/Gunicorn", "defaultPort": 8000},
			{"type": "mongodb", "name": "MongoDB", "defaultPort": 27017},
			{"type": "rabbitmq", "name": "RabbitMQ", "defaultPort": 5672},
			{"type": "elasticsearch", "name": "Elasticsearch", "defaultPort": 9200},
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": serviceTypes})
	}
}
