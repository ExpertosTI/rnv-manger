package backup

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type BackupRequest struct {
	Host     string `json:"host" binding:"required"`
	Port     int    `json:"port"`
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Command  string `json:"command"` // custom backup command
}

func Run(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req BackupRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if req.Port == 0 {
			req.Port = 22
		}

		cmd := req.Command
		if cmd == "" {
			cmd = "tar -czf /tmp/backup_$(date +%Y%m%d_%H%M%S).tar.gz /etc /var/www 2>&1 && echo 'Backup completado'"
		}

		cfg := serviceslayer.SSHConfig{
			Host:     req.Host,
			Port:     req.Port,
			Username: req.Username,
			Password: req.Password,
		}

		result := serviceslayer.SSHExec(cfg, cmd, 300) // 5 min timeout for backups

		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "BACKUP", "system",
			"Backup ejecutado en "+req.Host,
			models.JSON{"host": req.Host, "success": result.Success}, ip, userID)

		if result.Success {
			serviceslayer.CreateNotification(db, "success", "Backup Completado",
				"Backup ejecutado exitosamente en "+req.Host, nil)
		} else {
			serviceslayer.CreateNotification(db, "alert", "Error en Backup",
				"Falló el backup en "+req.Host+": "+result.Error, nil)
		}

		c.JSON(http.StatusOK, gin.H{"success": result.Success, "output": result.Output, "error": result.Error})
	}
}

func List(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req BackupRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if req.Port == 0 {
			req.Port = 22
		}

		cfg := serviceslayer.SSHConfig{
			Host:     req.Host,
			Port:     req.Port,
			Username: req.Username,
			Password: req.Password,
		}

		result := serviceslayer.SSHExec(cfg, "ls -lht /tmp/*.tar.gz /tmp/*.dump 2>/dev/null | head -20", 10)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result.Output})
	}
}
