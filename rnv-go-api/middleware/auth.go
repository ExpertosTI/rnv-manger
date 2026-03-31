package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/serviceslayer"
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
				"error":   "No autorizado - sesión requerida",
			})
			return
		}

		claims, err := serviceslayer.ValidateJWT(tokenStr, jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Sesión inválida o expirada",
			})
			return
		}

		c.Set("userID", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("userRole", claims.Role)
		c.Set("userName", claims.Name)
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
