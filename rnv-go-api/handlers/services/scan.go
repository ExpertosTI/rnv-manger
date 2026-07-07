package services

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

func Scan(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		vpsID := c.Query("vpsId")
		results, err := serviceslayer.ScanAllVPS(db, cfg, vpsID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		totalFound, totalCreated, totalUpdated := 0, 0, 0
		for _, r := range results {
			totalFound += len(r.Found)
			totalCreated += r.Created
			totalUpdated += r.Updated
		}

		userID := middleware.GetUserID(c)
		ip := middleware.GetClientIP(c)
		serviceslayer.LogAudit(db, "SCAN", "service", "Escaneo de servicios en VPS",
			models.JSON{"vpsId": vpsID, "found": totalFound, "created": totalCreated, "updated": totalUpdated},
			ip, userID)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"results": results,
			"totals": gin.H{
				"found":   totalFound,
				"created": totalCreated,
				"updated": totalUpdated,
				"vps":     len(results),
			},
		})
	}
}

type overviewVPS struct {
	ID       string           `json:"id"`
	Name     string           `json:"name"`
	IPAddress string          `json:"ipAddress"`
	Status   string           `json:"status"`
	ClientID *string          `json:"clientId,omitempty"`
	Client   *models.Client   `json:"client,omitempty"`
	Services []models.Service `json:"services"`
}

func Overview(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var vpsList []models.VPS
		db.Preload("Client").Order("name asc").Find(&vpsList)

		var allServices []models.Service
		db.Preload("Client").Preload("VPS").Order("name asc").Find(&allServices)

		byVPS := map[string][]models.Service{}
		unassigned := []models.Service{}
		for _, s := range allServices {
			if s.VpsID != nil {
				byVPS[*s.VpsID] = append(byVPS[*s.VpsID], s)
			} else {
				unassigned = append(unassigned, s)
			}
		}

		groups := make([]overviewVPS, 0, len(vpsList)+1)
		for _, v := range vpsList {
			svcs := byVPS[v.ID]
			enriched := make([]models.Service, len(svcs))
			for i, s := range svcs {
				enriched[i] = s
				vCopy := v
				enriched[i].VPS = &vCopy
				if s.Client == nil && v.Client != nil {
					enriched[i].Client = v.Client
				} else if s.Client == nil && s.ClientID != nil {
					// keep existing client preload
				}
			}
			groups = append(groups, overviewVPS{
				ID: v.ID, Name: v.Name, IPAddress: v.IPAddress, Status: v.Status,
				ClientID: v.ClientID, Client: v.Client,
				Services: enriched,
			})
		}
		if len(unassigned) > 0 {
			groups = append(groups, overviewVPS{
				ID: "unassigned", Name: "Sin VPS", IPAddress: "—", Status: "unknown",
				Services: unassigned,
			})
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    groups,
			"count":   len(allServices),
		})
	}
}
