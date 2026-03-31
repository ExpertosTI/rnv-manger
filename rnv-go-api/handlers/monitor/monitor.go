package monitor

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/serviceslayer"
)

type MonitorRequest struct {
	Host     string `json:"host" binding:"required"`
	Port     int    `json:"port"`
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func Metrics(db interface{}) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req MonitorRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Faltan credenciales"})
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

		metrics := serviceslayer.SSHGetMetrics(cfg)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": metrics})
	}
}
