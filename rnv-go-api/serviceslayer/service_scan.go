package serviceslayer

import (
	"encoding/json"
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
	Name   string  `json:"name"`
	Type   string  `json:"type"`
	Port   *int    `json:"port,omitempty"`
	Status string  `json:"status"`
	Image  string  `json:"image,omitempty"`
	URL    *string `json:"url,omitempty"`
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
var hostRuleRe = regexp.MustCompile(`Host\(` + "`" + `([^` + "`" + `]+)` + "`" + `\)`)

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
	case strings.Contains(s, "n8n"):
		return "n8n"
	case strings.Contains(s, "evolution"), strings.Contains(s, "evoapi"):
		return "evoapi"
	case strings.Contains(s, "node"):
		return "nodejs"
	default:
		return "docker"
	}
}


func inferServiceURL(name string) *string {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	lower := strings.ToLower(name)
	if strings.Contains(lower, "traefik") || strings.Contains(lower, "portainer") ||
		strings.Contains(lower, "postgres") || strings.Contains(lower, "redis") ||
		strings.Contains(lower, "watchtower") {
		return nil
	}
	u := fmt.Sprintf("https://%s.renace.tech", name)
	return &u
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

func isInfraContainer(name string) bool {
	n := strings.ToLower(strings.TrimPrefix(name, "/"))
	infra := []string{"traefik", "portainer", "watchtower", "rnv-manager", "postgres", "redis", "db-"}
	for _, p := range infra {
		if strings.Contains(n, p) {
			return true
		}
	}
	return false
}

func mergeTraefikHosts(existing []DiscoveredService, inspectOutput string) []DiscoveredService {
	byName := map[string]*DiscoveredService{}
	for i := range existing {
		byName[existing[i].Name] = &existing[i]
	}

	for _, line := range strings.Split(inspectOutput, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 2)
		if len(parts) < 2 {
			continue
		}
		name := strings.TrimPrefix(strings.TrimSpace(parts[0]), "/")
		var labels map[string]string
		if err := json.Unmarshal([]byte(parts[1]), &labels); err != nil {
			continue
		}
		var host string
		for k, v := range labels {
			if strings.Contains(k, "traefik.http.routers") && strings.Contains(k, ".rule") {
				if m := hostRuleRe.FindStringSubmatch(v); len(m) > 1 {
					host = strings.TrimSpace(m[1])
					break
				}
			}
		}
		if host == "" {
			continue
		}
		u := "https://" + host
		if d, ok := byName[name]; ok {
			d.URL = &u
		} else {
			existing = append(existing, DiscoveredService{
				Name: name, Type: inferServiceType(name, ""), Status: "running", URL: &u,
			})
			byName[name] = &existing[len(existing)-1]
		}
	}
	return existing
}

// ScanVPSServices discovers running docker containers + traefik routes on a VPS via SSH.
func ScanVPSServices(vps models.VPS, cfg *config.Config) ([]DiscoveredService, string, error) {
	if cfg.MasterPassword == "" {
		return nil, "", fmt.Errorf("MASTER_PASSWORD no configurado — añádelo en /etc/rnv-manager/rnv.env")
	}
	sshCfg := VPSSSHConfig(vps, cfg)

	// Running containers only
	cmd := `docker ps --filter status=running --format '{{.Names}}|{{.Image}}|{{.Ports}}|{{.State}}' 2>/dev/null`
	result := SSHExec(sshCfg, cmd, 120)
	if !result.Success && strings.TrimSpace(result.Output) == "" {
		errMsg := result.Error
		if errMsg == "" {
			errMsg = "no se pudo conectar por SSH o docker no responde"
		}
		return nil, result.Output, fmt.Errorf("%s (%s)", errMsg, vps.IPAddress)
	}

	discovered := parseDockerPS(result.Output)

	// Traefik / router hosts from container labels
	labelsCmd := `docker ps --filter status=running -q | xargs -r docker inspect --format '{{.Name}}|{{json .Config.Labels}}' 2>/dev/null`
	labelsOut := SSHExec(sshCfg, labelsCmd, 90)
	if labelsOut.Success {
		discovered = mergeTraefikHosts(discovered, labelsOut.Output)
	}

	// Deduplicate by name, prefer entry with URL/host
	seen := map[string]DiscoveredService{}
	for _, d := range discovered {
		if isInfraContainer(d.Name) {
			continue
		}
		if prev, ok := seen[d.Name]; ok {
			if d.URL != nil && prev.URL == nil {
				seen[d.Name] = d
			}
			continue
		}
		seen[d.Name] = d
	}
	out := make([]DiscoveredService, 0, len(seen))
	for _, d := range seen {
		out = append(out, d)
	}
	return out, result.Output + "\n" + labelsOut.Output, nil
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
			if u := inferServiceURL(d.Name); u != nil {
				svc.URL = u
			}
			if d.URL != nil {
				svc.URL = d.URL
			}
			svc.LastChecked = &now
			EnrichServiceIcon(&svc)
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
		if existing.URL == nil || *existing.URL == "" {
			if d.URL != nil {
				updates["url"] = *d.URL
			} else if u := inferServiceURL(d.Name); u != nil {
				updates["url"] = *u
			}
		}
		if existing.ClientID == nil && vps.ClientID != nil {
			updates["client_id"] = *vps.ClientID
		}
		urlToEnrich := existing.URL
		if u, ok := updates["url"].(string); ok && u != "" {
			tmp := u
			urlToEnrich = &tmp
		}
		if (existing.FaviconURL == nil || *existing.FaviconURL == "") && urlToEnrich != nil && *urlToEnrich != "" {
			tmp := existing
			tmp.URL = urlToEnrich
			EnrichServiceIcon(&tmp)
			if tmp.FaviconURL != nil {
				updates["favicon_url"] = *tmp.FaviconURL
			}
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
