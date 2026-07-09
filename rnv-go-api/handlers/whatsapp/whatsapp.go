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

type TestRequest struct {
	To   string `json:"to"`
	Text string `json:"text"`
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
		var req TestRequest
		_ = c.ShouldBindJSON(&req)

		wc := serviceslayer.ResolveWhatsAppConfig(db, cfg)
		if !wc.IsConfigured() {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "WhatsApp/Evolution API no configurado"})
			return
		}

		to := req.To
		if to == "" && len(wc.NotifyNums) > 0 {
			to = wc.NotifyNums[0]
		}
		if to == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Indica número destino o configura whatsapp_notify_numbers"})
			return
		}

		text := req.Text
		if text == "" {
			text = fmt.Sprintf("✅ RNV Manager — canal WhatsApp Renace activo\nInstancia: %s\nRemitente: +1 809 348 7921", wc.Instance)
		}

		if err := serviceslayer.SendWhatsApp(db, cfg, to, text); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Mensaje de prueba enviado",
			"to":      serviceslayer.NormalizeWhatsAppNumber(to),
		})
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
