package settings

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

func Get(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.Query("key")
		if key != "" {
			var setting models.AppSettings
			if err := db.Where("key = ?", key).First(&setting).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Setting no encontrado"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": setting})
			return
		}

		var settings []models.AppSettings
		category := c.Query("category")
		q := db.Order("key asc")
		if category != "" {
			q = q.Where("category = ?", category)
		}
		q.Find(&settings)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": settings})
	}
}

func Set(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Bulk update: { "settings": { "odoo_url": "...", ... } }
		var bulk struct {
			Settings map[string]string `json:"settings"`
		}
		if err := c.ShouldBindJSON(&bulk); err == nil && len(bulk.Settings) > 0 {
			for key, value := range bulk.Settings {
				upsertSetting(db, key, value, "general")
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "message": "Configuración guardada"})
			return
		}

		var body struct {
			Key      string `json:"key" binding:"required"`
			Value    string `json:"value"`
			Category string `json:"category"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if body.Category == "" {
			body.Category = "general"
		}
		setting := upsertSetting(db, body.Key, body.Value, body.Category)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": setting})
	}
}

func upsertSetting(db *gorm.DB, key, value, category string) models.AppSettings {
	var setting models.AppSettings
	result := db.Where("key = ?", key).First(&setting)
	if result.Error != nil {
		setting = models.AppSettings{Key: key, Value: value, Category: category}
		db.Create(&setting)
	} else {
		db.Model(&setting).Updates(map[string]interface{}{"value": value, "category": category})
	}
	return setting
}

func Delete(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.Query("key")
		if key == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Key requerida"})
			return
		}
		db.Where("key = ?", key).Delete(&models.AppSettings{})
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Setting eliminado"})
	}
}
