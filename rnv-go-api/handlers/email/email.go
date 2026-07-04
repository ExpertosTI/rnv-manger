package email

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

		sc := serviceslayer.ResolveSMTPConfig(db, cfg)
		if sc.Host == "" || sc.User == "" || sc.Pass == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "SMTP no configurado"})
			return
		}

		body := req.Body
		if !req.IsHTML {
			body = fmt.Sprintf("<pre>%s</pre>", req.Body)
		}

		if err := serviceslayer.SendEmail(db, cfg, req.To, req.Subject, body); err != nil {
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

func Config(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		sc := serviceslayer.ResolveSMTPConfig(db, cfg)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"configured": sc.Host != "" && sc.User != "" && sc.Pass != "",
				"host":       sc.Host,
				"port":       sc.Port,
				"user":       sc.User,
				"from":       sc.From,
			},
		})
	}
}
