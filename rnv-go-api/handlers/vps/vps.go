package vps

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

func List(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var vpsList []models.VPS
		db.Preload("Client").Preload("Services").
			Order("created_at desc").Find(&vpsList)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": vpsList, "count": len(vpsList)})
	}
}

func Create(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var vps models.VPS
		if err := c.ShouldBindJSON(&vps); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if err := db.Create(&vps).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		if vps.ClientID != nil {
			serviceslayer.RecalculateClientCost(db, *vps.ClientID)
		}
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "CREATE", "vps", "VPS creado: "+vps.Name,
			models.JSON{"vpsId": vps.ID, "ip": vps.IPAddress}, ip, userID)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": vps})
	}
}

func Get(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var vps models.VPS
		if err := db.Preload("Client").Preload("Services").First(&vps, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "VPS no encontrado"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": vps})
	}
}

func Update(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var vps models.VPS
		if err := db.First(&vps, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "VPS no encontrado"})
			return
		}
		oldClientID := vps.ClientID
		if err := c.ShouldBindJSON(&vps); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		vps.ID = id
		db.Save(&vps)
		if vps.ClientID != nil {
			serviceslayer.RecalculateClientCost(db, *vps.ClientID)
		}
		if oldClientID != nil && (vps.ClientID == nil || *oldClientID != *vps.ClientID) {
			serviceslayer.RecalculateClientCost(db, *oldClientID)
		}
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "UPDATE", "vps", "VPS actualizado: "+vps.Name,
			models.JSON{"vpsId": id}, ip, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": vps})
	}
}

func Delete(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var vps models.VPS
		if err := db.First(&vps, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "VPS no encontrado"})
			return
		}
		clientID := vps.ClientID
		db.Delete(&vps)
		if clientID != nil {
			serviceslayer.RecalculateClientCost(db, *clientID)
		}
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "DELETE", "vps", "VPS eliminado: "+vps.Name,
			models.JSON{"vpsId": id}, ip, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "VPS eliminado"})
	}
}

func ListServices(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		vpsID := c.Param("id")
		var services []models.Service
		db.Where("vps_id = ?", vpsID).Order("created_at desc").Find(&services)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": services})
	}
}

func CreateService(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		vpsID := c.Param("id")
		var service models.Service
		if err := c.ShouldBindJSON(&service); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		service.VpsID = &vpsID
		db.Create(&service)
		if service.ClientID != nil {
			serviceslayer.RecalculateClientCost(db, *service.ClientID)
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": service})
	}
}
