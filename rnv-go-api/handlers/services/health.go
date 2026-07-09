package services

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

func HealthCheck(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		results := serviceslayer.RunServiceHealthChecks(db, cfg)
		changed, offline, online := 0, 0, 0
		for _, r := range results {
			if r.Changed {
				changed++
			}
			if r.Method == "skip" {
				continue
			}
			if r.Online {
				online++
			} else {
				offline++
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"results": results,
			"summary": gin.H{"checked": len(results), "online": online, "offline": offline, "changed": changed},
		})
	}
}

func Offline(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		list, count := serviceslayer.ListOfflineServices(db)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": list, "count": count})
	}
}

func ProbeHealth(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		res, err := serviceslayer.ProbeServiceNow(db, cfg, id)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": res})
	}
}
