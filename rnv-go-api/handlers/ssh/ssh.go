package ssh

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type SSHRequest struct {
	Host     string `json:"host" binding:"required"`
	Port     int    `json:"port"`
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Command  string `json:"command"`
	Action   string `json:"action"` // "exec", "test", "info"
}

func Exec(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SSHRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Faltan credenciales SSH"})
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

		switch req.Action {
		case "test":
			ok, msg, latency := serviceslayer.SSHTest(cfg)
			c.JSON(http.StatusOK, gin.H{"success": ok, "message": msg, "latency": latency})
			return

		case "info":
			info := serviceslayer.SSHGetServerInfo(cfg)
			c.JSON(http.StatusOK, gin.H{"success": true, "data": info})
			return
		}

		// Default: exec command
		if req.Command == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No se especificó comando"})
			return
		}

		result := serviceslayer.SSHExec(cfg, req.Command, 30)

		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "SSH_COMMAND", "system",
			"Comando SSH ejecutado en "+req.Host,
			models.JSON{"command": req.Command, "host": req.Host}, ip, userID)

		c.JSON(http.StatusOK, result)
	}
}

// GET - Quick connection test via query params
func Test(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		host := c.Query("host")
		username := c.Query("username")
		password := c.Query("password")
		port := 22

		if host == "" || username == "" || password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Faltan parámetros"})
			return
		}

		cfg := serviceslayer.SSHConfig{Host: host, Port: port, Username: username, Password: password}
		ok, msg, latency := serviceslayer.SSHTest(cfg)
		c.JSON(http.StatusOK, gin.H{"success": ok, "message": msg, "latency": latency})
	}
}
