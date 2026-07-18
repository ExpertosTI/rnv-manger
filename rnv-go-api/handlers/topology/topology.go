package topology

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type Node struct {
	ID       string                 `json:"id"`
	Type     string                 `json:"type"` // client | vps | service
	Label    string                 `json:"label"`
	Status   string                 `json:"status,omitempty"`
	Meta     map[string]interface{} `json:"meta"`
	ParentID *string                `json:"parentId,omitempty"`
}

type Edge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind"` // owns | hosts | bills
}

func uptimeLabel(svc models.Service) string {
	if svc.Status == "running" {
		if svc.LastChecked != nil && time.Since(*svc.LastChecked) < 24*time.Hour {
			return "online"
		}
		return "running"
	}
	if svc.Status == "stopped" {
		return "offline"
	}
	return svc.Status
}

func serviceCharge(svc models.Service) (float64, string) {
	if svc.BillingCycle == serviceslayer.BillingCycleAnnual {
		if svc.AnnualCost > 0 {
			return svc.AnnualCost, "annual"
		}
		return svc.MonthlyCost * 12, "annual"
	}
	return svc.MonthlyCost, "monthly"
}

// Map returns conceptual graph: clients → VPS → services with costs and status.
func Map(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var clients []models.Client
		var vpsList []models.VPS
		var services []models.Service

		db.Where("is_active = true").Order("name asc").Find(&clients)
		db.Preload("Client").Order("name asc").Find(&vpsList)
		db.Preload("Client").Preload("VPS").Order("name asc").Find(&services)

		nodes := []Node{}
		edges := []Edge{}
		clusters := []map[string]interface{}{}

		clientMap := map[string]models.Client{}
		for _, cl := range clients {
			clientMap[cl.ID] = cl
			amount := serviceslayer.ClientChargeAmount(cl)
			nodes = append(nodes, Node{
				ID: cl.ID, Type: "client", Label: cl.Name, Status: statusActive(cl.IsActive),
				Meta: map[string]interface{}{
					"email": cl.Email, "billingCycle": serviceslayer.ClientBillingCycle(cl),
					"chargeAmount": amount, "paymentDay": cl.PaymentDay, "paymentMonth": cl.PaymentMonth,
					"monthlyFee": cl.MonthlyFee, "annualFee": cl.AnnualFee,
					"currency": cl.Currency, "dueDesc": serviceslayer.FormatDueDescription(cl),
				},
			})
		}

		servicesByVPS := map[string][]models.Service{}
		unassigned := []models.Service{}
		for _, s := range services {
			if s.VpsID != nil {
				servicesByVPS[*s.VpsID] = append(servicesByVPS[*s.VpsID], s)
			} else {
				unassigned = append(unassigned, s)
			}
		}

		var totalMonthlyRevenue float64
		for _, cl := range clients {
			totalMonthlyRevenue += serviceslayer.ClientChargeAmount(cl)
		}

		for _, v := range vpsList {
			svcs := servicesByVPS[v.ID]
			svcNodes := make([]map[string]interface{}, 0, len(svcs))
			var svcMonthlyCost float64

			for _, s := range svcs {
				charge, cycle := serviceCharge(s)
				if cycle == "monthly" {
					svcMonthlyCost += charge
				}
				clientName := ""
				clientID := s.ClientID
				if s.Client != nil {
					clientName = s.Client.Name
				} else if v.Client != nil {
					clientName = v.Client.Name
					clientID = v.ClientID
				}
				nodes = append(nodes, Node{
					ID: s.ID, Type: "service", Label: s.Name, Status: uptimeLabel(s),
					ParentID: &v.ID,
					Meta: map[string]interface{}{
						"type": s.Type, "port": s.Port, "url": s.URL, "faviconUrl": s.FaviconURL,
						"runtime": s.Runtime, "image": s.Image, "domains": s.Domains,
						"projectPath": s.ProjectPath, "purpose": s.Purpose,
						"monthlyCost": s.MonthlyCost, "annualCost": s.AnnualCost,
						"billingCycle": s.BillingCycle, "charge": charge, "chargeCycle": cycle,
						"clientId": clientID, "clientName": clientName,
						"lastChecked": s.LastChecked,
					},
				})
				edges = append(edges, Edge{From: v.ID, To: s.ID, Kind: "hosts"})
				if clientID != nil {
					edges = append(edges, Edge{From: *clientID, To: s.ID, Kind: "bills"})
				}
				svcNodes = append(svcNodes, map[string]interface{}{
					"id": s.ID, "name": s.Name, "type": s.Type, "status": uptimeLabel(s),
					"charge": charge, "chargeCycle": cycle, "url": s.URL, "faviconUrl": s.FaviconURL,
					"runtime": s.Runtime, "image": s.Image, "domains": s.Domains,
					"projectPath": s.ProjectPath, "purpose": s.Purpose,
					"clientName": clientName, "lastChecked": s.LastChecked,
				})
			}

			clientName := ""
			if v.Client != nil {
				clientName = v.Client.Name
			}
			if v.ClientID != nil {
				edges = append(edges, Edge{From: *v.ClientID, To: v.ID, Kind: "owns"})
			}

			nodes = append(nodes, Node{
				ID: v.ID, Type: "vps", Label: v.Name, Status: v.Status,
				Meta: map[string]interface{}{
					"ip": v.IPAddress, "provider": v.Provider,
					"monthlyCost": v.MonthlyCost, "serviceCount": len(svcs),
					"servicesMonthlyCost": svcMonthlyCost,
					"clientId":            v.ClientID, "clientName": clientName,
				},
			})

			clusters = append(clusters, map[string]interface{}{
				"vpsId": v.ID, "vpsName": v.Name, "ip": v.IPAddress, "status": v.Status,
				"clientId": v.ClientID, "clientName": clientName,
				"monthlyCost": v.MonthlyCost, "serviceCount": len(svcs),
				"servicesMonthlyCost": svcMonthlyCost,
				"totalClusterCost":    v.MonthlyCost + svcMonthlyCost,
				"services":            svcNodes,
			})
		}

		if len(unassigned) > 0 {
			orphanSvcs := make([]map[string]interface{}, 0, len(unassigned))
			for _, s := range unassigned {
				charge, cycle := serviceCharge(s)
				clientName := ""
				if s.Client != nil {
					clientName = s.Client.Name
				}
				orphanSvcs = append(orphanSvcs, map[string]interface{}{
					"id": s.ID, "name": s.Name, "status": uptimeLabel(s),
					"charge": charge, "chargeCycle": cycle, "clientName": clientName,
				})
				if s.ClientID != nil {
					edges = append(edges, Edge{From: *s.ClientID, To: s.ID, Kind: "bills"})
				}
			}
			clusters = append(clusters, map[string]interface{}{
				"vpsId": "unassigned", "vpsName": "Sin VPS", "ip": "—", "status": "unknown",
				"serviceCount": len(unassigned), "services": orphanSvcs,
			})
		}

		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"nodes":    nodes,
			"edges":    edges,
			"clusters": clusters,
			"totals": gin.H{
				"clients": len(clients), "vps": len(vpsList), "services": len(services),
				"monthlyRevenue": totalMonthlyRevenue,
			},
		})
	}
}

func statusActive(active bool) string {
	if active {
		return "active"
	}
	return "inactive"
}
