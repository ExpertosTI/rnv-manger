package inventory

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/middleware"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

func monthlyServiceRevenue(service models.Service) float64 {
	if service.BillingCycle == serviceslayer.BillingCycleAnnual {
		if service.AnnualCost > 0 {
			return service.AnnualCost / 12
		}
	}
	return service.MonthlyCost
}

func monthlyClientBase(client *models.Client) float64 {
	if client == nil {
		return 0
	}
	if client.BillingCycle == serviceslayer.BillingCycleAnnual {
		if client.AnnualFee > 0 {
			return client.AnnualFee / 12
		}
	}
	return client.MonthlyFee
}

func serviceRow(service models.Service, inheritedClient *models.Client) gin.H {
	client := service.Client
	if client == nil {
		client = inheritedClient
	}
	clientID, clientName := "", ""
	if client != nil {
		clientID, clientName = client.ID, client.Name
	}
	revenue := monthlyServiceRevenue(service)
	purpose := ""
	if service.Purpose != nil {
		purpose = *service.Purpose
	}
	cycle := service.BillingCycle
	if cycle != serviceslayer.BillingCycleAnnual {
		cycle = serviceslayer.BillingCycleMonthly
	}
	return gin.H{
		"id": service.ID, "name": service.Name, "type": service.Type,
		"runtime": service.Runtime, "image": service.Image, "status": service.Status,
		"port": service.Port, "url": service.URL, "domains": service.Domains,
		"projectPath": service.ProjectPath, "configFile": service.ConfigFile,
		"purpose": purpose, "clientId": clientID, "clientName": clientName,
		"billingCycle": cycle, "monthlyCost": service.MonthlyCost, "annualCost": service.AnnualCost,
		"monthlyRevenue": revenue, "generatesRevenue": revenue > 0,
		"lastChecked": service.LastChecked, "discoveredAt": service.DiscoveredAt,
	}
}

func latestSnapshots(db *gorm.DB) map[string]models.InventorySnapshot {
	var snapshots []models.InventorySnapshot
	db.Order("scanned_at desc").Limit(1000).Find(&snapshots)
	latest := map[string]models.InventorySnapshot{}
	for _, snapshot := range snapshots {
		if _, exists := latest[snapshot.VpsID]; !exists {
			latest[snapshot.VpsID] = snapshot
		}
	}
	return latest
}

// Report returns the latest discovered inventory enriched with ownership and economics.
func Report(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var vpsList []models.VPS
		query := db.Preload("Client").Preload("Services.Client").Order("name asc")
		if vpsID := c.Query("vpsId"); vpsID != "" {
			query = query.Where("id = ?", vpsID)
		}
		query.Find(&vpsList)
		latest := latestSnapshots(db)

		rows := make([]gin.H, 0, len(vpsList))
		totals := gin.H{
			"servers": len(vpsList), "services": 0,
			"monthlyRevenue": float64(0), "monthlyExpense": float64(0),
			"netProfit": float64(0), "unassignedServices": 0,
		}
		for _, vps := range vpsList {
			serviceRows := make([]gin.H, 0, len(vps.Services))
			serviceRevenue := float64(0)
			unassigned := 0
			for _, service := range vps.Services {
				row := serviceRow(service, vps.Client)
				serviceRows = append(serviceRows, row)
				revenue, _ := row["monthlyRevenue"].(float64)
				serviceRevenue += revenue
				if row["clientId"] == "" {
					unassigned++
				}
			}

			// Existing RNV billing semantics: assigned VPS cost is rebilled to its
			// client; base fee is attributed to the client's VPS.
			infrastructureRevenue := float64(0)
			baseRevenue := float64(0)
			if vps.Client != nil {
				infrastructureRevenue = vps.MonthlyCost
				var clientVPSCount int64
				db.Model(&models.VPS{}).Where("client_id = ?", vps.Client.ID).Count(&clientVPSCount)
				if clientVPSCount < 1 {
					clientVPSCount = 1
				}
				baseRevenue = monthlyClientBase(vps.Client) / float64(clientVPSCount)
			}
			revenue := serviceRevenue + infrastructureRevenue + baseRevenue
			expense := vps.MonthlyCost
			profit := revenue - expense

			snapshot, hasSnapshot := latest[vps.ID]
			var inventoryData interface{}
			var scannedAt *time.Time
			if hasSnapshot {
				inventoryData = snapshot.Data
				value := snapshot.ScannedAt
				scannedAt = &value
			}
			rows = append(rows, gin.H{
				"vpsId": vps.ID, "vpsName": vps.Name, "ip": vps.IPAddress,
				"provider": vps.Provider, "status": vps.Status,
				"client": vps.Client, "services": serviceRows,
				"inventory": inventoryData, "scannedAt": scannedAt,
				"economics": gin.H{
					"serviceRevenue":        serviceRevenue,
					"infrastructureRevenue": infrastructureRevenue,
					"baseFeeShare":          baseRevenue,
					"monthlyRevenue":        revenue, "monthlyExpense": expense,
					"netProfit": profit, "profitable": profit > 0,
				},
			})
			totals["services"] = totals["services"].(int) + len(vps.Services)
			totals["unassignedServices"] = totals["unassignedServices"].(int) + unassigned
			totals["monthlyRevenue"] = totals["monthlyRevenue"].(float64) + revenue
			totals["monthlyExpense"] = totals["monthlyExpense"].(float64) + expense
			totals["netProfit"] = totals["netProfit"].(float64) + profit
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": rows, "totals": totals})
	}
}

// Scan executes the fixed metadata-only scanner over SSH.
func Scan(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		vpsID := c.Query("vpsId")
		results := serviceslayer.ScanInventory(db, cfg, vpsID)
		if len(results) == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "No hay VPS para escanear"})
			return
		}
		ok := 0
		for _, result := range results {
			if result.Success {
				ok++
			}
		}
		serviceslayer.LogAudit(db, "SCAN", "inventory", "Inventario real de VPS",
			models.JSON{"vpsId": vpsID, "servers": len(results), "success": ok},
			middleware.GetClientIP(c), middleware.GetUserID(c))
		c.JSON(http.StatusOK, gin.H{
			"success": ok == len(results), "results": results,
			"totals": gin.H{"servers": len(results), "success": ok, "failed": len(results) - ok},
		})
	}
}
