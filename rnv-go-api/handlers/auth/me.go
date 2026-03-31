package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

func Me(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		authType, _ := c.Get("authType")

		// OTP session — look up by email
		if authType == "otp" || authType == "service_token" {
			email, _ := c.Get("email")
			emailStr, _ := email.(string)
			role, _ := c.Get("userRole")
			roleStr, _ := role.(string)
			allowedEmailID, _ := c.Get("allowedEmailID")
			idStr, _ := allowedEmailID.(string)

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"user": gin.H{
					"id":       idStr,
					"email":    emailStr,
					"name":     emailStr,
					"username": emailStr,
					"role":     roleStr,
					"isActive": true,
				},
			})
			return
		}

		// Legacy session — look up user by ID
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
