package notifications

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

func List(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var notifs []models.Notification
		q := db.Order("created_at desc").Limit(50)
		if c.Query("unread") == "true" {
			q = q.Where("is_read = false")
		}
		q.Find(&notifs)
		if notifs == nil {
			notifs = []models.Notification{}
		}

		var unreadCount int64
		db.Model(&models.Notification{}).Where("is_read = false").Count(&unreadCount)

		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"data":        notifs,
			"unreadCount": unreadCount,
		})
	}
}

func MarkRead(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			IDs    []string `json:"ids"`
			AllNew bool     `json:"all"`
		}
		c.ShouldBindJSON(&body)

		if body.AllNew || len(body.IDs) == 0 {
			db.Model(&models.Notification{}).Where("is_read = false").Update("is_read", true)
		} else {
			db.Model(&models.Notification{}).Where("id IN ?", body.IDs).Update("is_read", true)
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Notificaciones marcadas como leídas"})
	}
}
