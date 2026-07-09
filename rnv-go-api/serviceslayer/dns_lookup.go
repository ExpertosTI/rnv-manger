package serviceslayer

import (
	"net"
	"strings"

	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

func LookupHostIPs(hostname string) ([]string, error) {
	hostname = strings.TrimSpace(hostname)
	if hostname == "" {
		return nil, nil
	}
	ips, err := net.LookupIP(hostname)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(ips))
	for _, ip := range ips {
		if v4 := ip.To4(); v4 != nil {
			out = append(out, v4.String())
		}
	}
	return out, nil
}

func matchVPSByIP(db *gorm.DB, ip string) *models.VPS {
	if ip == "" {
		return nil
	}
	var vps models.VPS
	if db.Where("ip_address = ?", ip).First(&vps).Error == nil {
		return &vps
	}
	return nil
}

func DNSLookupWithVPS(db *gorm.DB, hostname string) map[string]interface{} {
	hostname = strings.TrimSpace(strings.ToLower(hostname))
	hostname = strings.TrimPrefix(hostname, "https://")
	hostname = strings.TrimPrefix(hostname, "http://")
	if idx := strings.Index(hostname, "/"); idx >= 0 {
		hostname = hostname[:idx]
	}
	ips, err := LookupHostIPs(hostname)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error(), "hostname": hostname}
	}
	var matched *models.VPS
	if len(ips) > 0 {
		matched = matchVPSByIP(db, ips[0])
	}
	out := map[string]interface{}{
		"success": true, "hostname": hostname, "ips": ips,
	}
	if matched != nil {
		out["matchedVps"] = map[string]interface{}{
			"id": matched.ID, "name": matched.Name, "ip": matched.IPAddress,
		}
	}
	return out
}
