package backup

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type RestoreRequest struct {
	Data struct {
		Clients  []models.Client  `json:"clients"`
		VPS      []models.VPS     `json:"vps"`
		Services []models.Service `json:"services"`
	} `json:"data"`
}

func Restore(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req RestoreRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid JSON format: " + err.Error()})
			return
		}

		err := db.Transaction(func(tx *gorm.DB) error {
			// 1. Restore Clients
			if len(req.Data.Clients) > 0 {
				if err := tx.Clauses(clause.OnConflict{
					UpdateAll: true,
				}).Create(&req.Data.Clients).Error; err != nil {
					return err
				}
			}

			// 2. Restore VPS
			if len(req.Data.VPS) > 0 {
				if err := tx.Clauses(clause.OnConflict{
					UpdateAll: true,
				}).Create(&req.Data.VPS).Error; err != nil {
					return err
				}
			}

			// 3. Restore Services
			if len(req.Data.Services) > 0 {
				if err := tx.Clauses(clause.OnConflict{
					UpdateAll: true,
				}).Create(&req.Data.Services).Error; err != nil {
					return err
				}
			}

			return nil
		})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to restore data: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Data restored successfully",
			"counts": gin.H{
				"clients":  len(req.Data.Clients),
				"vps":      len(req.Data.VPS),
				"services": len(req.Data.Services),
			},
		})
	}
}
