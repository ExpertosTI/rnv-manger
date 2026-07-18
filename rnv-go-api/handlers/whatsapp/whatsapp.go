package whatsapp

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type SendRequest struct {
	To   string `json:"to" binding:"required"`
	Text string `json:"text" binding:"required"`
}

func Config(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := serviceslayer.WhatsAppStatus(db, cfg)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": status})
	}
}

func Send(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SendRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		wc := serviceslayer.ResolveWhatsAppConfig(db, cfg)
		if !wc.IsConfigured() {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "WhatsApp/Evolution API no configurado"})
			return
		}
		if !serviceslayer.IsKnownWhatsAppRecipient(db, cfg, req.To) {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Destino bloqueado: solo números guardados explícitamente en RNV (cliente/servicio/admin)",
			})
			return
		}

		if err := serviceslayer.SendWhatsApp(db, cfg, req.To, req.Text); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "WHATSAPP", "system",
			fmt.Sprintf("WhatsApp enviado a %s", req.To),
			models.JSON{"to": req.To, "preview": truncate(req.Text, 120)}, ip, userID)

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Mensaje enviado por WhatsApp"})
	}
}

func Test(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		wc := serviceslayer.ResolveWhatsAppConfig(db, cfg)
		if !wc.IsConfigured() {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "WhatsApp/Evolution API no configurado"})
			return
		}
		state, connected := serviceslayer.CheckEvolutionConnection(db, cfg)
		if !connected {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false, "error": "Instancia WhatsApp no conectada", "state": state,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"message":  "Conexión WhatsApp verificada sin enviar mensajes",
			"state":    state,
			"instance": wc.Instance,
		})
	}
}

// Contacts returns only recipients explicitly stored in RNV.
func Contacts(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		dir, err := serviceslayer.FetchWhatsAppContacts(db, cfg)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error(), "data": dir})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": dir})
	}
}

type LinkRequest struct {
	ServiceID string `json:"serviceId" binding:"required"`
	Phone     string `json:"phone" binding:"required"`
}

// LinkPhone binds a WhatsApp number to a service for quick identification/notify.
func LinkPhone(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req LinkRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "serviceId y phone requeridos"})
			return
		}
		svc, err := serviceslayer.LinkWhatsAppPhoneToService(db, req.ServiceID, req.Phone)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		serviceslayer.LogAudit(db, "UPDATE", "service",
			"WhatsApp vinculado a servicio "+svc.Name,
			models.JSON{"serviceId": svc.ID, "phone": req.Phone},
			middleware.GetClientIP(c), middleware.GetUserID(c))
		c.JSON(http.StatusOK, gin.H{"success": true, "data": svc})
	}
}

type NotifyRequest struct {
	ServiceID string `json:"serviceId"`
	ClientID  string `json:"clientId"`
	Text      string `json:"text" binding:"required"`
}

// NotifyService sends WhatsApp using the number linked to a service/client.
func NotifyService(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req NotifyRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "text requerido"})
			return
		}
		to, source, err := serviceslayer.ResolveNotifyTarget(db, req.ServiceID, req.ClientID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if err := serviceslayer.SendWhatsApp(db, cfg, to, req.Text); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		serviceslayer.LogAudit(db, "WHATSAPP", "service",
			"Notificación WhatsApp a "+to,
			models.JSON{"to": to, "source": source, "serviceId": req.ServiceID, "clientId": req.ClientID},
			middleware.GetClientIP(c), middleware.GetUserID(c))
		c.JSON(http.StatusOK, gin.H{"success": true, "to": to, "source": source})
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
