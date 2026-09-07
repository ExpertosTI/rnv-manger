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
	Email      string `json:"email"`
	Identifier string `json:"identifier"`
	Channel    string `json:"channel"` // email | whatsapp
}

type OTPVerify struct {
	Email      string `json:"email"`
	Identifier string `json:"identifier"`
	Code       string `json:"code" binding:"required"`
}

type TargetAuth struct {
	User         *models.User
	AllowedEmail *models.AllowedEmail
	Phone        string
	Email        string
	DisplayName  string
}

func maskPhone(phone string) string {
	digits := ""
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			digits += string(r)
		}
	}
	if len(digits) > 4 {
		return "..." + digits[len(digits)-4:]
	}
	return phone
}

func maskEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return email
	}
	name := parts[0]
	if len(name) > 2 {
		name = name[:2] + "***"
	}
	return name + "@" + parts[1]
}

func findTargetAuth(db *gorm.DB, identifier string) *TargetAuth {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return nil
	}

	cleanDigits := ""
	for _, r := range identifier {
		if r >= '0' && r <= '9' {
			cleanDigits += string(r)
		}
	}

	// 1. Try finding in models.User (collaborator, affiliate, or admin user)
	var user models.User
	var err error
	if len(cleanDigits) >= 7 {
		err = db.Where("is_active = true AND (username = ? OR email = ? OR phone = ? OR phone LIKE ?)",
			identifier, strings.ToLower(identifier), identifier, "%"+cleanDigits+"%").First(&user).Error
	} else {
		err = db.Where("is_active = true AND (username = ? OR email = ?)",
			identifier, strings.ToLower(identifier)).First(&user).Error
	}

	if err == nil {
		phone := ""
		if user.Phone != nil && *user.Phone != "" {
			phone = *user.Phone
		} else if len(cleanDigits) >= 7 {
			phone = cleanDigits
		}
		return &TargetAuth{
			User:        &user,
			Phone:       phone,
			Email:       user.Email,
			DisplayName: user.Name,
		}
	}

	// 2. Try finding in models.AllowedEmail (legacy admin emails)
	var allowed models.AllowedEmail
	if err := db.Where("email = ? AND active = true", strings.ToLower(identifier)).First(&allowed).Error; err == nil {
		return &TargetAuth{
			AllowedEmail: &allowed,
			Email:        allowed.Email,
			DisplayName:  allowed.Email,
		}
	}

	return nil
}

func RequestOTP(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req OTPRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Teléfono o correo requerido"})
			return
		}

		rawId := strings.TrimSpace(req.Identifier)
		if rawId == "" {
			rawId = strings.TrimSpace(req.Email)
		}
		if rawId == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Ingresa tu número de WhatsApp o correo electrónico"})
			return
		}

		target := findTargetAuth(db, rawId)
		if target == nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "No se encontró ninguna cuenta asociada a este número o correo",
			})
			return
		}

		ip := middleware.GetClientIP(c)
		channel := strings.ToLower(strings.TrimSpace(req.Channel))
		if channel != "email" {
			channel = "whatsapp"
		}

		// Use normalized primary lookup key for rate limiting and OTP storage
		primaryKey := strings.ToLower(rawId)
		if target.User != nil && target.User.Phone != nil && *target.User.Phone != "" {
			primaryKey = strings.ToLower(*target.User.Phone)
		} else if target.Email != "" {
			primaryKey = strings.ToLower(target.Email)
		}

		// Rate limiting: max 5 requests per 15 minutes
		var recentCount int64
		db.Model(&models.OTPCode{}).
			Where("(email = ? OR email = ?) AND created_at > ?", primaryKey, strings.ToLower(rawId), time.Now().Add(-15*time.Minute)).
			Count(&recentCount)
		if recentCount >= 5 {
			c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "error": "Demasiados intentos. Espera 15 minutos."})
			return
		}

		// Generate 6-digit code
		code, err := generateOTPCode()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error generando código"})
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
			Email:     primaryKey,
			CodeHash:  string(codeHash),
			Channel:   channel,
			ExpiresAt: time.Now().Add(5 * time.Minute),
			IPAddress: ip,
		}
		db.Create(&otp)

		// Send code via chosen channel
		if channel == "whatsapp" {
			if target.User != nil {
				if target.Phone == "" {
					c.JSON(http.StatusBadRequest, gin.H{
						"success": false,
						"error":   "Tu cuenta no tiene un número telefónico asignado para WhatsApp. Solicita el código por correo.",
					})
					return
				}
				if err := serviceslayer.SendOTPToPhone(db, cfg, target.Phone, target.DisplayName, code); err != nil {
					c.JSON(http.StatusServiceUnavailable, gin.H{
						"success": false,
						"error":   "Error enviando WhatsApp: " + err.Error(),
					})
					return
				}
				c.JSON(http.StatusOK, gin.H{
					"success": true,
					"message": fmt.Sprintf("Código de acceso enviado a tu WhatsApp (%s)", maskPhone(target.Phone)),
					"channel": "whatsapp",
					"sentTo":  maskPhone(target.Phone),
					"key":     primaryKey,
				})
				return
			}

			// Admin OTP
			waErr := serviceslayer.SendOTPWhatsApp(db, cfg, target.Email, code)
			if waErr != nil {
				// Fallback to email
				if mailErr := serviceslayer.SendOTPEmail(db, cfg, target.Email, code); mailErr != nil {
					c.JSON(http.StatusServiceUnavailable, gin.H{
						"success": false,
						"error":   "WhatsApp no disponible: " + waErr.Error(),
					})
					return
				}
				c.JSON(http.StatusOK, gin.H{
					"success": true,
					"message": "WhatsApp no disponible — código enviado a " + maskEmail(target.Email),
					"channel": "email",
					"warning": waErr.Error(),
					"key":     primaryKey,
				})
				return
			}
			if cfg.NotificationEmail != "" {
				_ = serviceslayer.SendOTPEmail(db, cfg, cfg.NotificationEmail, code)
			}
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "Código de acceso enviado por WhatsApp al número de administrador",
				"channel": "whatsapp",
				"key":     primaryKey,
			})
			return
		}

		// Channel == email
		if target.Email == "" || strings.HasSuffix(target.Email, "@whatsapp.rnv.internal") {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Tu cuenta fue registrada únicamente con WhatsApp. Selecciona recibir el código por WhatsApp.",
			})
			return
		}

		if err := serviceslayer.SendOTPEmail(db, cfg, target.Email, code); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"success": false,
				"error":   "Error enviando correo con el código.",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": fmt.Sprintf("Código de acceso enviado a %s", maskEmail(target.Email)),
			"channel": "email",
			"sentTo":  maskEmail(target.Email),
			"key":     primaryKey,
		})
	}
}

func VerifyOTP(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req OTPVerify
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Código e identificador requeridos"})
			return
		}

		rawId := strings.TrimSpace(req.Identifier)
		if rawId == "" {
			rawId = strings.TrimSpace(req.Email)
		}
		if rawId == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Identificador requerido"})
			return
		}

		target := findTargetAuth(db, rawId)
		if target == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Usuario no encontrado"})
			return
		}

		ip := middleware.GetClientIP(c)
		ua := c.GetHeader("User-Agent")

		// Possible keys for OTP lookup
		keys := []string{strings.ToLower(rawId)}
		if target.Phone != "" {
			keys = append(keys, strings.ToLower(target.Phone))
		}
		if target.Email != "" {
			keys = append(keys, strings.ToLower(target.Email))
		}

		var otp models.OTPCode
		err := db.Where("email IN (?) AND used = false AND expires_at > ?", keys, time.Now()).
			Order("created_at DESC").First(&otp).Error
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Código inválido o expirado"})
			return
		}

		if otp.Attempts >= 3 {
			db.Model(&otp).Update("used", true)
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Código invalidado por demasiados intentos"})
			return
		}

		db.Model(&otp).Update("attempts", otp.Attempts+1)

		if bcrypt.CompareHashAndPassword([]byte(otp.CodeHash), []byte(req.Code)) != nil {
			remaining := 2 - otp.Attempts
			msg := "Código incorrecto"
			if remaining > 0 {
				msg = fmt.Sprintf("Código incorrecto. %d intentos restantes.", remaining)
			}
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": msg})
			return
		}

		db.Model(&otp).Update("used", true)

		secure := strings.HasPrefix(cfg.AppURL, "https")

		// 1. If it's a registered User (collaborator, affiliate, or user)
		if target.User != nil {
			token, err := serviceslayer.GenerateJWT(target.User, cfg.JWTSecret)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error generando sesión"})
				return
			}

			now := time.Now()
			db.Model(target.User).Update("last_login_at", now)

			uaStr := ua
			session := models.Session{
				Token:     token,
				UserID:    target.User.ID,
				IPAddress: ip,
				UserAgent: &uaStr,
				ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
			}
			db.Create(&session)

			serviceslayer.LogAudit(db, "LOGIN_OTP", "system",
				"Login con OTP WhatsApp/Email exitoso: "+target.User.Username,
				models.JSON{"userId": target.User.ID, "role": target.User.Role, "channel": otp.Channel}, ip, &target.User.ID)

			c.SetCookie("rnv_session", token, 7*24*60*60, "/", "", secure, true)

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"token":   token,
				"user": gin.H{
					"id":       target.User.ID,
					"username": target.User.Username,
					"email":    target.User.Email,
					"name":     target.User.Name,
					"role":     target.User.Role,
					"phone":    target.User.Phone,
				},
			})
			return
		}

		// 2. Legacy AllowedEmail (admin)
		if target.AllowedEmail != nil {
			token, err := serviceslayer.GenerateOTPJWT(target.AllowedEmail, cfg.JWTSecret)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error generando sesión"})
				return
			}

			session := models.Session{
				Token:          token,
				AllowedEmailID: &target.AllowedEmail.ID,
				IPAddress:      ip,
				UserAgent:      &ua,
				ExpiresAt:      time.Now().Add(24 * time.Hour),
			}
			db.Create(&session)

			serviceslayer.LogAuditWithEmail(db, "LOGIN_OTP", "system",
				"Login OTP exitoso: "+target.AllowedEmail.Email,
				models.JSON{"email": target.AllowedEmail.Email, "role": target.AllowedEmail.Role}, ip, &target.AllowedEmail.Email)

			c.SetCookie("rnv_session", token, 24*60*60, "/", "", secure, true)

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"token":   token,
				"user": gin.H{
					"id":    target.AllowedEmail.ID,
					"email": target.AllowedEmail.Email,
					"role":  target.AllowedEmail.Role,
					"name":  target.AllowedEmail.Email,
				},
			})
			return
		}

		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Usuario no autorizado"})
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
