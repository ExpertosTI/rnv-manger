package services

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

type ControlRequest struct {
	Action string `json:"action"` // start | stop | restart | status
}

func Control(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req ControlRequest
		_ = c.ShouldBindJSON(&req)
		action := strings.ToLower(strings.TrimSpace(req.Action))
		if action == "" {
			action = "restart"
		}

		var svc models.Service
		if err := db.Preload("VPS").First(&svc, "id = ?", id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Servicio no encontrado"})
			return
		}
		if svc.VPS == nil && svc.VpsID != nil {
			var vps models.VPS
			if db.First(&vps, "id = ?", *svc.VpsID).Error == nil {
				svc.VPS = &vps
			}
		}
		if svc.VPS == nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "El servicio no tiene VPS asignado"})
			return
		}
		if cfg.MasterPassword == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "MASTER_PASSWORD no configurado en el servidor (credencial SSH root)",
			})
			return
		}

		cmd, err := serviceslayer.ServiceControlCommand(svc, action)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		sshCfg := serviceslayer.VPSSSHConfig(*svc.VPS, cfg)
		result := serviceslayer.SSHExec(sshCfg, cmd, 60)

		newStatus := svc.Status
		if result.Success {
			switch action {
			case "start", "restart":
				newStatus = "running"
			case "stop":
				newStatus = "stopped"
			}
			now := time.Now()
			db.Model(&svc).Updates(map[string]interface{}{
				"status":       newStatus,
				"last_checked": now,
			})
		}

		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "SERVICE_CONTROL", "service",
			"Servicio "+svc.Name+": "+action+" en "+svc.VPS.IPAddress,
			models.JSON{"serviceId": id, "action": action, "command": cmd, "success": result.Success},
			ip, userID)

		c.JSON(http.StatusOK, gin.H{
			"success": result.Success,
			"action":  action,
			"command": cmd,
			"output":  result.Output,
			"error":   result.Error,
			"status":  newStatus,
		})
	}
}
