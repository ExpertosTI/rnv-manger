package auth

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type OTPRequest struct {
	Email string `json:"email" binding:"required"`
}

type OTPVerify struct {
	Email string `json:"email" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

func RequestOTP(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req OTPRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Email requerido"})
			return
		}

		email := strings.ToLower(strings.TrimSpace(req.Email))
		ip := middleware.GetClientIP(c)

		// Check if email is allowed
		var allowed models.AllowedEmail
		if err := db.Where("email = ? AND active = true", email).First(&allowed).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Email no autorizado"})
			return
		}

		// Rate limiting: max 5 requests per 15 minutes
		var recentCount int64
		db.Model(&models.OTPCode{}).
			Where("email = ? AND created_at > ?", email, time.Now().Add(-15*time.Minute)).
			Count(&recentCount)
		if recentCount >= 5 {
			c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "error": "Demasiados intentos. Espera 15 minutos."})
			return
		}

		// Generate 6-digit code
		code, err := generateOTPCode()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error generando codigo"})
			return
		}

		// Hash the code
		codeHash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error interno"})
			return
		}

		// Store OTP
		otp := models.OTPCode{
			Email:     email,
			CodeHash:  string(codeHash),
			ExpiresAt: time.Now().Add(5 * time.Minute),
			IPAddress: ip,
		}
		db.Create(&otp)

		// Send email
		if err := serviceslayer.SendOTPEmail(cfg, email, code); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"error":   fmt.Sprintf("Error enviando email: %v. Verifica la configuracion SMTP.", err),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Codigo enviado a " + email})
	}
}

func VerifyOTP(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req OTPVerify
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Email y codigo requeridos"})
			return
		}

		email := strings.ToLower(strings.TrimSpace(req.Email))
		ip := middleware.GetClientIP(c)
		ua := c.GetHeader("User-Agent")

		// Find most recent unused, non-expired OTP for this email
		var otp models.OTPCode
		err := db.Where("email = ? AND used = false AND expires_at > ?", email, time.Now()).
			Order("created_at DESC").First(&otp).Error
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Codigo invalido o expirado"})
			return
		}

		// Check max attempts
		if otp.Attempts >= 3 {
			db.Model(&otp).Update("used", true)
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Codigo invalidado por demasiados intentos"})
			return
		}

		// Increment attempts
		db.Model(&otp).Update("attempts", otp.Attempts+1)

		// Verify code
		if bcrypt.CompareHashAndPassword([]byte(otp.CodeHash), []byte(req.Code)) != nil {
			remaining := 2 - otp.Attempts
			msg := "Codigo incorrecto"
			if remaining > 0 {
				msg = fmt.Sprintf("Codigo incorrecto. %d intentos restantes.", remaining)
			}
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": msg})
			return
		}

		// Mark as used
		db.Model(&otp).Update("used", true)

		// Find allowed email
		var allowed models.AllowedEmail
		if err := db.Where("email = ? AND active = true", email).First(&allowed).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Email no encontrado"})
			return
		}

		// Generate JWT
		token, err := serviceslayer.GenerateOTPJWT(&allowed, cfg.JWTSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error generando sesion"})
			return
		}

		// Create session
		session := models.Session{
			Token:          token,
			AllowedEmailID: &allowed.ID,
			IPAddress:      ip,
			UserAgent:      &ua,
			ExpiresAt:      time.Now().Add(24 * time.Hour),
		}
		db.Create(&session)

		// Audit log
		serviceslayer.LogAuditWithEmail(db, "LOGIN", "system",
			"Login OTP exitoso: "+email,
			models.JSON{"email": email, "role": allowed.Role}, ip, &email)

		// Send login notification
		ipStr := "desconocida"
		if ip != nil {
			ipStr = *ip
		}
		go serviceslayer.SendLoginNotification(cfg, email, ipStr, time.Now().Format("2006-01-02 15:04:05 MST"))

		// Set cookie
		secure := strings.HasPrefix(cfg.AppURL, "https")
		c.SetCookie("rnv_session", token, 24*60*60, "/", "", secure, true)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"token":   token,
			"user": gin.H{
				"id":    allowed.ID,
				"email": allowed.Email,
				"role":  allowed.Role,
				"name":  allowed.Email,
			},
		})
	}
}

func generateOTPCode() (string, error) {
	max := big.NewInt(1000000)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}
