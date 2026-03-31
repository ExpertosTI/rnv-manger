package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

func Logout(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)

		// Delete session token from DB
		if token, err := c.Cookie("rnv_session"); err == nil {
			db.Where("token = ?", token).Delete(&models.Session{})
		}

		// Clear cookie
		c.SetCookie("rnv_session", "", -1, "/", "", false, true)

		serviceslayer.LogAudit(db, "LOGOUT", "system", "Sesión cerrada",
			nil, ip, userID)

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Sesión cerrada"})
	}
}
