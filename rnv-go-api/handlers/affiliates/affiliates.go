package affiliates

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type CreateInviteRequest struct {
	Name      *string `json:"name"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	Note      *string `json:"note"`
	DaysValid int     `json:"daysValid"`
}

type RegisterRequest struct {
	Token    string  `json:"token" binding:"required"`
	Name     string  `json:"name" binding:"required"`
	Email    *string `json:"email"`
	Phone    *string `json:"phone"`
	Password string  `json:"password" binding:"required,min=6"`
}

type AssignClientsRequest struct {
	ClientIDs []string `json:"clientIds" binding:"required"`
	Action    string   `json:"action"` // assign | unassign
}

type ToggleStatusRequest struct {
	IsActive bool `json:"isActive"`
}

type EnrichedAffiliate struct {
	ID             string     `json:"id"`
	Username       string     `json:"username"`
	Email          string     `json:"email"`
	Name           string     `json:"name"`
	Phone          *string    `json:"phone,omitempty"`
	Role           string     `json:"role"`
	IsActive       bool       `json:"isActive"`
	LastLoginAt    *time.Time `json:"lastLoginAt,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	ClientCount    int        `json:"clientCount"`
	ActiveClients  int        `json:"activeClients"`
	MonthlyRevenue float64    `json:"monthlyRevenue"`
}

func generateSecureToken(bytesLen int) (string, error) {
	b := make([]byte, bytesLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// List returns all affiliates/collaborators with aggregated portfolio stats (Master view).
func List(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var users []models.User
		if err := db.Where("role IN ?", []string{"affiliate", "collaborator"}).
			Order("created_at desc").Find(&users).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		out := make([]EnrichedAffiliate, 0, len(users))
		for _, u := range users {
			var clients []models.Client
			db.Where("affiliate_id = ?", u.ID).Find(&clients)

			clientCount := len(clients)
			activeClients := 0
			monthlyRevenue := 0.0

			for _, cl := range clients {
				if cl.IsActive {
					activeClients++
					fee := cl.MonthlyFee
					if cl.BillingCycle == "annual" && cl.AnnualFee > 0 {
						fee = cl.AnnualFee / 12.0
					}
					monthlyRevenue += fee
				}
			}

			out = append(out, EnrichedAffiliate{
				ID:             u.ID,
				Username:       u.Username,
				Email:          u.Email,
				Name:           u.Name,
				Phone:          u.Phone,
				Role:           u.Role,
				IsActive:       u.IsActive,
				LastLoginAt:    u.LastLoginAt,
				CreatedAt:      u.CreatedAt,
				ClientCount:    clientCount,
				ActiveClients:  activeClients,
				MonthlyRevenue: monthlyRevenue,
			})
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": out})
	}
}

// CreateInvite creates a secure registration invitation link for an affiliate.
func CreateInvite(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CreateInviteRequest
		_ = c.ShouldBindJSON(&req)

		days := req.DaysValid
		if days <= 0 {
			days = 7
		}

		token, err := generateSecureToken(16)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error generando token"})
			return
		}

		actorEmail := middleware.GetActorEmail(c)
		creator := "admin"
		if actorEmail != nil && *actorEmail != "" {
			creator = *actorEmail
		}

		expiresAt := time.Now().AddDate(0, 0, days)
		invite := models.AffiliateInvite{
			Token:     token,
			Name:      req.Name,
			Email:     req.Email,
			Phone:     req.Phone,
			Note:      req.Note,
			CreatedBy: creator,
			ExpiresAt: expiresAt,
			Used:      false,
		}

		if err := db.Create(&invite).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		baseURL := cfg.AppURL
		if baseURL == "" {
			baseURL = "https://rnv.renace.tech"
		}
		baseURL = strings.TrimSuffix(baseURL, "/")

		inviteURL := fmt.Sprintf("%s/afiliados/registro?token=%s", baseURL, token)

		recipientGreeting := "¡Hola!"
		if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
			recipientGreeting = fmt.Sprintf("¡Hola %s!", strings.TrimSpace(*req.Name))
		}

		waMessage := fmt.Sprintf(
			"👋 *%s*\n\nTe comparto tu enlace de acceso como *Colaborador / Afiliado* en *RNV Manager (RENACE)*.\n\nCompleta tu registro aquí para acceder a tu panel:\n🔗 %s\n\n⏰ _Este enlace es de uso único y expira en %d días._",
			recipientGreeting, inviteURL, days,
		)

		cleanPhone := ""
		if req.Phone != nil {
			for _, r := range *req.Phone {
				if r >= '0' && r <= '9' {
					cleanPhone += string(r)
				}
			}
		}

		waDirectURL := fmt.Sprintf("https://wa.me/?text=%s", url.QueryEscape(waMessage))
		if cleanPhone != "" {
			waDirectURL = fmt.Sprintf("https://wa.me/%s?text=%s", cleanPhone, url.QueryEscape(waMessage))
		}

		c.JSON(http.StatusCreated, gin.H{
			"success":         true,
			"data":            invite,
			"inviteUrl":       inviteURL,
			"whatsappMessage": waMessage,
			"whatsappUrl":     waDirectURL,
		})
	}
}

// ListInvites returns all generated invitations (pending and used).
func ListInvites(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var invites []models.AffiliateInvite
		if err := db.Preload("UsedBy").Order("created_at desc").Limit(100).Find(&invites).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": invites})
	}
}

// RevokeInvite deletes an unused invitation token.
func RevokeInvite(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var invite models.AffiliateInvite
		if err := db.First(&invite, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Invitación no encontrada"})
			return
		}
		if invite.Used {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No se puede revocar una invitación que ya fue utilizada"})
			return
		}
		db.Delete(&invite)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Invitación revocada exitosamente"})
	}
}

// GetInviteInfo validates a token publicly before rendering the registration page.
func GetInviteInfo(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := strings.TrimSpace(c.Query("token"))
		if token == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Token requerido"})
			return
		}

		var invite models.AffiliateInvite
		if err := db.First(&invite, "token = ?", token).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "El enlace de invitación no es válido o ha expirado"})
			return
		}

		if invite.Used {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Este enlace de invitación ya fue utilizado previamente"})
			return
		}

		if invite.ExpiresAt.Before(time.Now()) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Este enlace de invitación ha caducado"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"token":     invite.Token,
				"name":      invite.Name,
				"email":     invite.Email,
				"phone":     invite.Phone,
				"note":      invite.Note,
				"expiresAt": invite.ExpiresAt,
			},
		})
	}
}

// Register signs up an affiliate using their invitation token and returns a JWT session.
func Register(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req RegisterRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Datos incompletos o contraseña menor a 6 caracteres"})
			return
		}

		token := strings.TrimSpace(req.Token)
		name := strings.TrimSpace(req.Name)
		if token == "" || name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "El nombre completo y token de invitación son requeridos"})
			return
		}

		var email string
		if req.Email != nil {
			email = strings.ToLower(strings.TrimSpace(*req.Email))
		}

		var phone *string
		cleanPhone := ""
		if req.Phone != nil && strings.TrimSpace(*req.Phone) != "" {
			p := strings.TrimSpace(*req.Phone)
			phone = &p
			for _, r := range p {
				if r >= '0' && r <= '9' {
					cleanPhone += string(r)
				}
			}
		}

		// Must have at least email or phone!
		if email == "" && cleanPhone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Debes proporcionar al menos tu correo electrónico o tu número de WhatsApp"})
			return
		}

		var invite models.AffiliateInvite
		if err := db.First(&invite, "token = ?", token).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invitación no válida"})
			return
		}

		if invite.Used {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Esta invitación ya fue utilizada"})
			return
		}

		if invite.ExpiresAt.Before(time.Now()) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Esta invitación ha expirado"})
			return
		}

		// If user registered with WhatsApp only (no email provided), generate an internal email identifier
		if email == "" {
			email = fmt.Sprintf("%s@whatsapp.rnv.internal", cleanPhone)
		}

		// Check if user with this email or phone already exists
		var existingUser models.User
		query := db.Where("email = ?", email)
		if phone != nil && *phone != "" {
			query = db.Where("email = ? OR phone = ?", email, *phone)
		}
		if err := query.First(&existingUser).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Ya existe una cuenta con este correo electrónico o número telefónico"})
			return
		}

		hash, err := serviceslayer.HashPassword(req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error procesando contraseña"})
			return
		}

		username := email
		if idx := strings.Index(email, "@"); idx > 0 {
			username = email[:idx]
		}
		// Ensure unique username
		var count int64
		db.Model(&models.User{}).Where("username = ?", username).Count(&count)
		if count > 0 {
			username = fmt.Sprintf("%s_%d", username, time.Now().Unix()%10000)
		}

		user := models.User{
			Username: username,
			Email:    email,
			Password: hash,
			Name:     name,
			Phone:    phone,
			Role:     "affiliate",
			IsActive: true,
		}

		if err := db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error al registrar usuario: " + err.Error()})
			return
		}

		// Also register in AllowedEmail so OTP works for them too
		var allowed models.AllowedEmail
		if err := db.Where("email = ?", email).First(&allowed).Error; err != nil {
			allowed = models.AllowedEmail{
				Email:  email,
				Role:   "affiliate",
				Active: true,
			}
			db.Create(&allowed)
		}

		// Mark invite as used
		now := time.Now()
		db.Model(&invite).Updates(map[string]interface{}{
			"used":       true,
			"used_at":    now,
			"used_by_id": user.ID,
		})

		// Generate session JWT
		jwtToken, err := serviceslayer.GenerateJWT(&user, cfg.JWTSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Error generando sesión"})
			return
		}

		// Set cookie
		c.SetCookie("rnv_session", jwtToken, 7*24*3600, "/", "", false, true)

		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "REGISTER", "affiliate", "Nuevo afiliado registrado: "+name+" ("+email+")",
			models.JSON{"userId": user.ID, "inviteId": invite.ID}, ip, &user.ID)

		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"token":   jwtToken,
			"user": gin.H{
				"id":       user.ID,
				"username": user.Username,
				"email":    user.Email,
				"name":     user.Name,
				"role":     user.Role,
				"phone":    user.Phone,
				"isActive": user.IsActive,
			},
		})
	}
}

// AssignClients assigns or unassigns a list of clients to an affiliate.
func AssignClients(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		affiliateID := c.Param("id")
		var affiliate models.User
		if err := db.First(&affiliate, "id = ? AND role IN ?", affiliateID, []string{"affiliate", "collaborator"}).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Afiliado no encontrado"})
			return
		}

		var req AssignClientsRequest
		if err := c.ShouldBindJSON(&req); err != nil || len(req.ClientIDs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Lista de clientes requerida"})
			return
		}

		action := strings.ToLower(strings.TrimSpace(req.Action))
		if action == "unassign" {
			res := db.Model(&models.Client{}).Where("id IN ? AND affiliate_id = ?", req.ClientIDs, affiliateID).
				Update("affiliate_id", nil)
			c.JSON(http.StatusOK, gin.H{"success": true, "updated": res.RowsAffected})
			return
		}

		// Default: assign
		res := db.Model(&models.Client{}).Where("id IN ?", req.ClientIDs).
			Update("affiliate_id", affiliateID)

		actor := middleware.GetActorEmail(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAuditWithEmail(db, "ASSIGN", "client",
			fmt.Sprintf("%d clientes asignados a %s", res.RowsAffected, affiliate.Name),
			models.JSON{"affiliateId": affiliateID, "clientIds": req.ClientIDs}, ip, actor)

		c.JSON(http.StatusOK, gin.H{"success": true, "updated": res.RowsAffected})
	}
}

// ToggleStatus activates or deactivates an affiliate.
func ToggleStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var user models.User
		if err := db.First(&user, "id = ? AND role IN ?", id, []string{"affiliate", "collaborator"}).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Afiliado no encontrado"})
			return
		}

		var req ToggleStatusRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "isActive requerido"})
			return
		}

		db.Model(&user).Update("is_active", req.IsActive)
		db.Model(&models.AllowedEmail{}).Where("email = ?", user.Email).Update("active", req.IsActive)

		c.JSON(http.StatusOK, gin.H{"success": true, "isActive": req.IsActive})
	}
}
