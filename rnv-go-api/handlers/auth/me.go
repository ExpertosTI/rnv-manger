package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

func Me(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("userID")
		var user models.User
		if err := db.First(&user, "id = ?", userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Usuario no encontrado"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"user": gin.H{
				"id":          user.ID,
				"username":    user.Username,
				"email":       user.Email,
				"name":        user.Name,
				"role":        user.Role,
				"avatar":      user.Avatar,
				"isActive":    user.IsActive,
				"lastLoginAt": user.LastLoginAt,
				"createdAt":   user.CreatedAt,
			},
		})
	}
}
