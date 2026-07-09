package dns

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type auditRequest struct {
	Zone   string `json:"zone"`
	Domain string `json:"domain"`
}

// Audit returns DNS zone depuration grouped by IP vs RNV inventory.
func Audit(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		zoneText := ""
		if c.Request.Method == http.MethodPost {
			var req auditRequest
			if err := c.ShouldBindJSON(&req); err == nil && req.Zone != "" {
				zoneText = req.Zone
			}
		}
		if zoneText == "" {
			zoneText = loadBundledZone()
		}
		if zoneText == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Sin zona DNS — sube el export de Cloudflare (POST zone) o coloca data/dns/renace.tech.zone",
			})
			return
		}

		domain := c.Query("domain")
		if domain == "" {
			domain = "renace.tech"
		}
		audit := serviceslayer.AuditDNSZone(db, zoneText, domain)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": audit})
	}
}

func loadBundledZone() string {
	paths := []string{
		"data/dns/renace.tech.zone",
		"/opt/rnv-manager/rnv-go-api/data/dns/renace.tech.zone",
		"/opt/rnv-manager/data/dns/renace.tech.zone",
	}
	for _, p := range paths {
		if b, err := os.ReadFile(filepath.Clean(p)); err == nil && len(b) > 0 {
			return string(b)
		}
	}
	return ""
}
