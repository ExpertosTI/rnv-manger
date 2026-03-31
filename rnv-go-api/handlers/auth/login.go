package auth

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type LoginRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password" binding:"required"`
}

func Login(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Contraseña requerida"})
			return
		}

		ip := middleware.GetClientIP(c)
		ua := c.GetHeader("User-Agent")

		// Try to find user by username or email
		var user models.User
		var err error

		identifier := req.Username
		if identifier == "" {
			identifier = req.Email
		}

		if identifier != "" {
			// Login with username/email
			err = db.Where("(username = ? OR email = ?) AND is_active = true",
				identifier, identifier).First(&user).Error
		} else {
			// Legacy: password-only (master password or first active admin)
			err = db.Where("is_active = true AND role IN ('superadmin', 'admin')").
				Order("created_at asc").First(&user).Error
		}

		if err != nil {
			// Check master password fallback
			if cfg.MasterPassword != "" && req.Password == cfg.MasterPassword {
				// Auto-create or find admin
				serviceslayer.EnsureDefaultAdmin(db, cfg.MasterPassword)
				db.Where("username = 'admin'").First(&user)
			} else {
				serviceslayer.LogAudit(db, "LOGIN", "system", "Intento de login fallido: usuario no encontrado",
					models.JSON{"identifier": identifier}, ip, nil)
				c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Credenciales incorrectas"})
				return
			}
		}

		if !serviceslayer.CheckPassword(req.Password, user.Password) {
			// Also check master password as override
			if cfg.MasterPassword == "" || req.Password != cfg.MasterPassword {
				serviceslayer.LogAudit(db, "LOGIN", "system", "Intento de login fallido: contraseña incorrecta",
					models.JSON{"userId": user.ID}, ip, &user.ID)
				c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Credenciales incorrectas"})
				return
			}
		}

		// Generate JWT
		token, err := serviceslayer.GenerateJWT(&user, cfg.JWTSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Error generando sesión"})
			return
		}

		// Update last login
		now := time.Now()
		db.Model(&user).Update("last_login_at", now)

		// Store session in DB (for audit trail / force-logout capability)
		uaStr := ua
		session := models.Session{
			Token:     token,
			UserID:    user.ID,
			IPAddress: ip,
			UserAgent: &uaStr,
			ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		}
		db.Create(&session)

		// Audit log
		serviceslayer.LogAudit(db, "LOGIN", "system",
			"Login exitoso: "+user.Username,
			models.JSON{"userId": user.ID, "role": user.Role}, ip, &user.ID)

		// Set HTTP-only cookie (same name as legacy: rnv_session)
		secure := strings.HasPrefix(cfg.AppURL, "https")
		c.SetCookie("rnv_session", token, 7*24*60*60, "/", "", secure, true)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"token":   token,
			"user": gin.H{
				"id":       user.ID,
				"username": user.Username,
				"email":    user.Email,
				"name":     user.Name,
				"role":     user.Role,
				"avatar":   user.Avatar,
			},
		})
	}
}
