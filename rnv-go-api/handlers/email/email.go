package email

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gopkg.in/gomail.v2"
	"gorm.io/gorm"
)

type EmailRequest struct {
	To      string `json:"to" binding:"required"`
	Subject string `json:"subject" binding:"required"`
	Body    string `json:"body" binding:"required"`
	IsHTML  bool   `json:"isHtml"`
	From    string `json:"from"`
}

func Send(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req EmailRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		if cfg.SMTPHost == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "SMTP no configurado"})
			return
		}

		from := req.From
		if from == "" {
			from = cfg.SMTPFrom
		}
		if from == "" {
			from = cfg.SMTPUser
		}

		m := gomail.NewMessage()
		m.SetHeader("From", from)
		m.SetHeader("To", req.To)
		m.SetHeader("Subject", req.Subject)

		contentType := "text/plain"
		if req.IsHTML {
			contentType = "text/html"
		}
		m.SetBody(contentType, req.Body)

		port, _ := strconv.Atoi(cfg.SMTPPort)
		d := gomail.NewDialer(cfg.SMTPHost, port, cfg.SMTPUser, cfg.SMTPPass)
		d.TLSConfig = &tls.Config{InsecureSkipVerify: true}

		if err := d.DialAndSend(m); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   fmt.Sprintf("Error enviando email: %v", err),
			})
			return
		}

		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "EMAIL", "system",
			fmt.Sprintf("Email enviado a %s: %s", req.To, req.Subject),
			models.JSON{"to": req.To, "subject": req.Subject}, ip, userID)

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Email enviado correctamente"})
	}
}

func Config(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"configured": cfg.SMTPHost != "",
				"host":       cfg.SMTPHost,
				"port":       cfg.SMTPPort,
				"from":       cfg.SMTPFrom,
			},
		})
	}
}
