package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func RequireAuth(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenStr string

		// 1. Try cookie first (web browser sessions)
		if cookie, err := c.Cookie("rnv_session"); err == nil && cookie != "" {
			tokenStr = cookie
		}

		// 2. Fall back to Authorization: Bearer header (Tauri app / API clients)
		if tokenStr == "" {
			authHeader := c.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "No autorizado - sesion requerida",
			})
			return
		}

		// 3. Check if it's a service token (starts with "rnv_")
		if strings.HasPrefix(tokenStr, "rnv_") {
			handleServiceToken(c, tokenStr)
			return
		}

		// 4. Try OTP JWT first (new auth)
		otpClaims, err := serviceslayer.ValidateOTPJWT(tokenStr, jwtSecret)
		if err == nil {
			c.Set("email", otpClaims.Email)
			c.Set("userRole", otpClaims.Role)
			c.Set("allowedEmailID", otpClaims.AllowedEmailID)
			c.Set("userID", "")
			c.Set("username", otpClaims.Email)
			c.Set("userName", otpClaims.Email)
			c.Set("authType", "otp")
			c.Next()
			return
		}

		// 5. Fall back to legacy JWT (old auth)
		claims, err := serviceslayer.ValidateJWT(tokenStr, jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Sesion invalida o expirada",
			})
			return
		}

		c.Set("userID", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("userRole", claims.Role)
		c.Set("userName", claims.Name)
		c.Set("email", "")
		c.Set("authType", "legacy")
		c.Next()
	}
}

func handleServiceToken(c *gin.Context, tokenStr string) {
	db, exists := c.Get("db")
	if !exists {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Database not available",
		})
		return
	}
	gormDB := db.(*gorm.DB)

	var tokens []models.ServiceToken
	gormDB.Where("active = ?", true).Find(&tokens)

	for _, token := range tokens {
		if token.ExpiresAt != nil && token.ExpiresAt.Before(time.Now()) {
			continue
		}
		if bcrypt.CompareHashAndPassword([]byte(token.TokenHash), []byte(tokenStr)) == nil {
			// Match found
			now := time.Now()
			gormDB.Model(&token).Update("last_used", now)

			c.Set("userRole", token.Role)
			c.Set("email", "service-token:"+token.Name)
			c.Set("username", "service-token:"+token.Name)
			c.Set("userName", token.Name)
			c.Set("userID", "")
			c.Set("allowedEmailID", token.CreatedBy)
			c.Set("isServiceToken", true)
			c.Set("authType", "service_token")
			c.Next()
			return
		}
	}

	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
		"success": false,
		"error":   "Token de servicio invalido",
	})
}

// InjectDB middleware to make DB available in context for service token auth
func InjectDB(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("db", db)
		c.Next()
	}
}

func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userRole, _ := c.Get("userRole")
		role, _ := userRole.(string)
		for _, r := range roles {
			if r == role {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"success": false,
			"error":   "Permisos insuficientes",
		})
	}
}

func GetClientIP(c *gin.Context) *string {
	ip := c.GetHeader("X-Forwarded-For")
	if ip == "" {
		ip = c.GetHeader("X-Real-IP")
	}
	if ip == "" {
		ip = c.ClientIP()
	}
	if ip == "" {
		return nil
	}
	// Take only first IP if comma-separated
	parts := strings.Split(ip, ",")
	clean := strings.TrimSpace(parts[0])
	return &clean
}

func GetUserID(c *gin.Context) *string {
	val, exists := c.Get("userID")
	if !exists {
		return nil
	}
	id, ok := val.(string)
	if !ok || id == "" {
		return nil
	}
	return &id
}

func GetActorEmail(c *gin.Context) *string {
	val, exists := c.Get("email")
	if !exists {
		return nil
	}
	s, ok := val.(string)
	if !ok || s == "" {
		return nil
	}
	return &s
}
