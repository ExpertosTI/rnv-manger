package serviceslayer

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

type DiscoveredService struct {
	Name   string `json:"name"`
	Type   string `json:"type"`
	Port   *int   `json:"port,omitempty"`
	Status string `json:"status"`
	Image  string `json:"image,omitempty"`
}

type VPSScanResult struct {
	VpsID    string              `json:"vpsId"`
	VpsName  string              `json:"vpsName"`
	IP       string              `json:"ip"`
	Success  bool                `json:"success"`
	Error    string              `json:"error,omitempty"`
	Output   string              `json:"output,omitempty"`
	Found    []DiscoveredService `json:"found"`
	Created  int                 `json:"created"`
	Updated  int                 `json:"updated"`
}

var portRe = regexp.MustCompile(`:(\d+)->`)

func inferServiceType(name, image string) string {
	s := strings.ToLower(name + " " + image)
	switch {
	case strings.Contains(s, "odoo"):
		return "odoo"
	case strings.Contains(s, "nginx"), strings.Contains(s, "traefik"), strings.Contains(s, "caddy"):
		return "nginx"
	case strings.Contains(s, "postgres"):
		return "postgres"
	case strings.Contains(s, "mysql"), strings.Contains(s, "mariadb"):
		return "mysql"
	case strings.Contains(s, "redis"):
		return "redis"
	case strings.Contains(s, "mongo"):
		return "mongodb"
	case strings.Contains(s, "rabbit"):
		return "rabbitmq"
	case strings.Contains(s, "elastic"):
		return "elasticsearch"
	case strings.Contains(s, "node"):
		return "nodejs"
	default:
		return "docker"
	}
}

func parseDockerLine(line string) (DiscoveredService, bool) {
	line = strings.TrimSpace(line)
	if line == "" {
		return DiscoveredService{}, false
	}
	parts := strings.Split(line, "|")
	if len(parts) < 4 {
		return DiscoveredService{}, false
	}
	name := strings.TrimSpace(parts[0])
	if name == "" || name == "NAMES" {
		return DiscoveredService{}, false
	}
	image := strings.TrimSpace(parts[1])
	ports := strings.TrimSpace(parts[2])
	state := strings.ToLower(strings.TrimSpace(parts[3]))

	status := "stopped"
	if strings.Contains(state, "running") {
		status = "running"
	}

	var port *int
	if m := portRe.FindStringSubmatch(ports); len(m) > 1 {
		if p, err := strconv.Atoi(m[1]); err == nil {
			port = &p
		}
	}

	return DiscoveredService{
		Name:   name,
		Type:   inferServiceType(name, image),
		Port:   port,
		Status: status,
		Image:  image,
	}, true
}

func parseDockerPS(output string) []DiscoveredService {
	var out []DiscoveredService
	seen := map[string]bool{}
	for _, line := range strings.Split(output, "\n") {
		d, ok := parseDockerLine(line)
		if !ok || seen[d.Name] {
			continue
		}
		seen[d.Name] = true
		out = append(out, d)
	}
	return out
}

// ScanVPSServices discovers docker containers on a VPS via SSH.
func ScanVPSServices(vps models.VPS, cfg *config.Config) ([]DiscoveredService, string, error) {
	if cfg.MasterPassword == "" {
		return nil, "", fmt.Errorf("MASTER_PASSWORD no configurado para SSH")
	}
	sshCfg := VPSSSHConfig(vps, cfg)
	cmd := "docker ps -a --format '{{.Names}}|{{.Image}}|{{.Ports}}|{{.State}}' 2>/dev/null"
	result := SSHExec(sshCfg, cmd, 90)
	if !result.Success && result.Output == "" {
		return nil, result.Output, fmt.Errorf(result.Error)
	}
	return parseDockerPS(result.Output), result.Output, nil
}

// SyncScannedServices upserts discovered services for a VPS (inherits client from VPS).
func SyncScannedServices(db *gorm.DB, vps models.VPS, discovered []DiscoveredService) (created, updated int) {
	now := time.Now()
	for _, d := range discovered {
		var existing models.Service
		err := db.Where("vps_id = ? AND name = ?", vps.ID, d.Name).First(&existing).Error
		if err != nil {
			svc := models.Service{
				Name:     d.Name,
				Type:     d.Type,
				Port:     d.Port,
				Status:   d.Status,
				VpsID:    &vps.ID,
				ClientID: vps.ClientID,
			}
			svc.LastChecked = &now
			if db.Create(&svc).Error == nil {
				created++
			}
			continue
		}
		updates := map[string]interface{}{
			"type": d.Type, "status": d.Status, "last_checked": now,
		}
		if d.Port != nil {
			updates["port"] = *d.Port
		}
		if existing.ClientID == nil && vps.ClientID != nil {
			updates["client_id"] = *vps.ClientID
		}
		if db.Model(&existing).Updates(updates).Error == nil {
			updated++
		}
	}
	if vps.ClientID != nil {
		RecalculateClientCost(db, *vps.ClientID)
	}
	return created, updated
}

// ScanAllVPS runs discovery on one or all VPS records.
func ScanAllVPS(db *gorm.DB, cfg *config.Config, vpsID string) ([]VPSScanResult, error) {
	var vpsList []models.VPS
	q := db.Order("name asc")
	if vpsID != "" {
		q = q.Where("id = ?", vpsID)
	}
	if err := q.Find(&vpsList).Error; err != nil {
		return nil, err
	}
	if len(vpsList) == 0 {
		return nil, fmt.Errorf("no hay VPS registrados")
	}

	results := make([]VPSScanResult, 0, len(vpsList))
	for _, vps := range vpsList {
		r := VPSScanResult{
			VpsID:   vps.ID,
			VpsName: vps.Name,
			IP:      vps.IPAddress,
		}
		found, output, err := ScanVPSServices(vps, cfg)
		r.Output = output
		if err != nil {
			r.Error = err.Error()
			results = append(results, r)
			continue
		}
		r.Success = true
		r.Found = found
		r.Created, r.Updated = SyncScannedServices(db, vps, found)
		results = append(results, r)
	}
	return results, nil
}
