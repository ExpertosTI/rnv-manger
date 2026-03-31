package health

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type HealthCheckRequest struct {
	Services []struct {
		Name string `json:"name"`
		Host string `json:"host"`
		Port int    `json:"port"`
	} `json:"services"`
}

func Check(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// API health
		if c.Request.Method == "GET" {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"status":  "healthy",
				"service": "rnv-go-api",
				"time":    time.Now().UTC(),
			})
			return
		}

		// POST: check multiple services
		var req HealthCheckRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		type Result struct {
			Name    string `json:"name"`
			Host    string `json:"host"`
			Port    int    `json:"port"`
			Online  bool   `json:"online"`
			Latency int64  `json:"latency"`
		}

		var results []Result
		for _, svc := range req.Services {
			start := time.Now()
			online := serviceslayer.CheckPortOpen(svc.Host, svc.Port, 5)
			latency := time.Since(start).Milliseconds()
			results = append(results, Result{
				Name:    svc.Name,
				Host:    svc.Host,
				Port:    svc.Port,
				Online:  online,
				Latency: latency,
			})
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results})
	}
}
