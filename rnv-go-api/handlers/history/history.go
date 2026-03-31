package history

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func List(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var history []models.RevenueHistory
		year := c.Query("year")
		q := db.Order("year desc, month desc")
		if year != "" {
			q = q.Where("year = ?", year)
		}
		q.Limit(24).Find(&history)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": history})
	}
}

func Upsert(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var h models.RevenueHistory
		if err := c.ShouldBindJSON(&h); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		result := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "year"}, {Name: "month"}},
			DoUpdates: clause.AssignmentColumns([]string{"revenue", "expenses", "clients", "vps", "services", "updated_at"}),
		}).Create(&h)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": result.Error.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": h})
	}
}
