package serviceslayer

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

// Inventory scanning is intentionally metadata-only: no file contents,
// environment variables, credentials or arbitrary commands are returned.
type InventoryContainer struct {
	Name        string            `json:"name"`
	Image       string            `json:"image"`
	Status      string            `json:"status"`
	Runtime     string            `json:"runtime"`
	Ports       []int             `json:"ports,omitempty"`
	Domains     []string          `json:"domains,omitempty"`
	Project     string            `json:"project,omitempty"`
	ProjectPath string            `json:"projectPath,omitempty"`
	MountPaths  []string          `json:"mountPaths,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
}

type InventoryProject struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Kind string `json:"kind"`
}

type InventorySystemService struct {
	Name        string `json:"name"`
	Load        string `json:"load"`
	Active      string `json:"active"`
	Sub         string `json:"sub"`
	Description string `json:"description,omitempty"`
}

type VPSInventoryData struct {
	Hostname       string                   `json:"hostname,omitempty"`
	Addresses      []string                 `json:"addresses,omitempty"`
	Containers     []InventoryContainer     `json:"containers"`
	Projects       []InventoryProject       `json:"projects"`
	SystemServices []InventorySystemService `json:"systemServices"`
	ListeningPorts []string                 `json:"listeningPorts"`
	ProxyDomains   []string                 `json:"proxyDomains"`
	ScannedAt      time.Time                `json:"scannedAt"`
}

var (
	hostLabelRe = regexp.MustCompile(`(?i)Host(?:SNI)?\(` + "`" + `([^` + "`" + `]+)` + "`" + `\)`)
	portNumRe   = regexp.MustCompile(`(?m)(?:^|:)(\d{2,5})(?:->|/|$)`)
)

func parseContainerInventory(output string) []InventoryContainer {
	var containers []InventoryContainer
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 6)
		if len(parts) < 6 {
			continue
		}
		c := InventoryContainer{
			Name:    strings.TrimPrefix(strings.TrimSpace(parts[0]), "/"),
			Image:   strings.TrimSpace(parts[1]),
			Status:  strings.TrimSpace(parts[2]),
			Runtime: "docker",
			Labels:  map[string]string{},
		}
		_ = json.Unmarshal([]byte(parts[3]), &c.Labels)
		c.Project = c.Labels["com.docker.compose.project"]
		c.ProjectPath = c.Labels["com.docker.compose.project.working_dir"]
		for key, value := range c.Labels {
			if strings.Contains(key, "traefik.http.routers") &&
				(strings.HasSuffix(key, ".rule") || strings.HasSuffix(key, ".ruleSyntax")) {
				for _, match := range hostLabelRe.FindAllStringSubmatch(value, -1) {
					if len(match) > 1 {
						c.Domains = appendUniqueString(c.Domains, match[1])
					}
				}
			}
		}
		for _, match := range portNumRe.FindAllStringSubmatch(parts[4], -1) {
			if len(match) > 1 {
				if port, err := strconv.Atoi(match[1]); err == nil && port <= 65535 {
					seen := false
					for _, p := range c.Ports {
						seen = seen || p == port
					}
					if !seen {
						c.Ports = append(c.Ports, port)
					}
				}
			}
		}
		var mounts []struct {
			Type        string `json:"Type"`
			Source      string `json:"Source"`
			Destination string `json:"Destination"`
		}
		if json.Unmarshal([]byte(parts[5]), &mounts) == nil {
			for _, mount := range mounts {
				if mount.Source != "" {
					c.MountPaths = appendUniqueString(c.MountPaths, mount.Source)
				}
			}
		}
		sort.Strings(c.Domains)
		sort.Ints(c.Ports)
		containers = append(containers, c)
	}
	return containers
}

func parseProjects(output string) []InventoryProject {
	seen := map[string]bool{}
	var projects []InventoryProject
	for _, raw := range strings.Split(output, "\n") {
		path := strings.TrimSpace(raw)
		if path == "" || seen[path] {
			continue
		}
		seen[path] = true
		base := filepath.Base(path)
		kind := "project"
		switch {
		case strings.Contains(base, "compose"):
			kind = "docker-compose"
		case base == "Dockerfile":
			kind = "docker"
		case base == "package.json":
			kind = "node"
		case base == "go.mod":
			kind = "go"
		case base == "pyproject.toml" || base == "requirements.txt":
			kind = "python"
		}
		projects = append(projects, InventoryProject{
			Name: filepath.Base(filepath.Dir(path)), Path: filepath.Dir(path), Kind: kind,
		})
	}
	sort.Slice(projects, func(i, j int) bool { return projects[i].Path < projects[j].Path })
	return projects
}

func parseSystemServices(output string) []InventorySystemService {
	var services []InventorySystemService
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) < 4 {
			continue
		}
		services = append(services, InventorySystemService{
			Name: fields[0], Load: fields[1], Active: fields[2], Sub: fields[3],
			Description: strings.Join(fields[4:], " "),
		})
	}
	return services
}

func lines(output string) []string {
	var values []string
	for _, line := range strings.Split(output, "\n") {
		if value := strings.TrimSpace(line); value != "" {
			values = append(values, value)
		}
	}
	return values
}

func inventoryToJSON(data VPSInventoryData) models.JSON {
	raw, _ := json.Marshal(data)
	out := models.JSON{}
	_ = json.Unmarshal(raw, &out)
	return out
}

// ScanVPSInventory reads operational metadata from one registered VPS over SSH.
func ScanVPSInventory(db *gorm.DB, cfg *config.Config, vps models.VPS) (models.InventorySnapshot, error) {
	snapshot := models.InventorySnapshot{VpsID: vps.ID, ScannedAt: time.Now()}
	if cfg.MasterPassword == "" {
		err := fmt.Errorf("MASTER_PASSWORD no configurado")
		snapshot.Error = err.Error()
		db.Create(&snapshot)
		return snapshot, err
	}
	sshCfg := VPSSSHConfig(vps, cfg)
	if test := SSHExec(sshCfg, "printf RNV_INVENTORY_OK", 15); !test.Success {
		err := fmt.Errorf("SSH %s: %s", vps.IPAddress, strings.TrimSpace(test.Error))
		snapshot.Error = err.Error()
		db.Create(&snapshot)
		return snapshot, err
	}

	// Static, read-only commands. We deliberately do not read .env or file contents.
	containerCmd := `docker ps -aq 2>/dev/null | xargs -r docker inspect --format '{{.Name}}|{{.Config.Image}}|{{.State.Status}}|{{json .Config.Labels}}|{{json .NetworkSettings.Ports}}|{{json .Mounts}}' 2>/dev/null`
	projectCmd := `find /opt /srv /var/www /home -maxdepth 5 -type f \( -name 'compose.yml' -o -name 'compose.yaml' -o -name 'docker-compose.yml' -o -name 'docker-compose.yaml' -o -name 'Dockerfile' -o -name 'package.json' -o -name 'go.mod' -o -name 'pyproject.toml' -o -name 'requirements.txt' \) 2>/dev/null | sort -u | head -1000`
	systemdCmd := `systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null | head -500`
	portsCmd := `ss -H -lntup 2>/dev/null | head -1000`
	proxyCmd := `(nginx -T 2>/dev/null | awk '/^[[:space:]]*server_name[[:space:]]+/ {for(i=2;i<=NF;i++){gsub(/;/,"",$i); print $i}}'; find /etc/caddy /opt -maxdepth 4 -name Caddyfile -type f -exec awk '/^[^#[:space:]][^ {]*[[:space:]]*\{/ {gsub(/[,{]/,"",$1); print $1}' {} \; 2>/dev/null) | grep -E '^[A-Za-z0-9*._-]+\.[A-Za-z]{2,}$' | sort -u | head -1000`

	containersOut := SSHExec(sshCfg, containerCmd, 120)
	projectsOut := SSHExec(sshCfg, projectCmd, 120)
	systemdOut := SSHExec(sshCfg, systemdCmd, 60)
	portsOut := SSHExec(sshCfg, portsCmd, 45)
	proxyOut := SSHExec(sshCfg, proxyCmd, 90)
	hostOut := SSHExec(sshCfg, `hostname 2>/dev/null; hostname -I 2>/dev/null`, 15)

	hostLines := lines(hostOut.Output)
	data := VPSInventoryData{
		Containers:     parseContainerInventory(containersOut.Output),
		Projects:       parseProjects(projectsOut.Output),
		SystemServices: parseSystemServices(systemdOut.Output),
		ListeningPorts: lines(portsOut.Output),
		ProxyDomains:   lines(proxyOut.Output),
		ScannedAt:      snapshot.ScannedAt,
	}
	if len(hostLines) > 0 {
		data.Hostname = hostLines[0]
	}
	if len(hostLines) > 1 {
		data.Addresses = strings.Fields(strings.Join(hostLines[1:], " "))
	}
	for _, container := range data.Containers {
		for _, domain := range container.Domains {
			data.ProxyDomains = appendUniqueString(data.ProxyDomains, domain)
		}
	}
	sort.Strings(data.ProxyDomains)

	discovered := make([]DiscoveredService, 0, len(data.Containers))
	for _, container := range data.Containers {
		var port *int
		if len(container.Ports) > 0 {
			value := container.Ports[0]
			port = &value
		}
		var url *string
		if len(container.Domains) > 0 {
			value := "https://" + container.Domains[0]
			url = &value
		}
		discovered = append(discovered, DiscoveredService{
			Name: container.Name, Type: inferServiceType(container.Name, container.Image),
			Runtime: container.Runtime, Port: port, Status: container.Status,
			Image: container.Image, URL: url, Domains: container.Domains,
			ProjectPath: container.ProjectPath, Labels: models.JSON{},
		})
	}
	SyncScannedServices(db, vps, discovered)

	snapshot.Data = inventoryToJSON(data)
	snapshot.Success = true
	db.Create(&snapshot)
	return snapshot, nil
}

// ScanInventory scans one VPS or all registered VPS records.
func ScanInventory(db *gorm.DB, cfg *config.Config, vpsID string) []models.InventorySnapshot {
	var vpsList []models.VPS
	query := db.Order("name asc")
	if vpsID != "" {
		query = query.Where("id = ?", vpsID)
	}
	query.Find(&vpsList)
	results := make([]models.InventorySnapshot, 0, len(vpsList))
	for _, vps := range vpsList {
		snapshot, _ := ScanVPSInventory(db, cfg, vps)
		results = append(results, snapshot)
	}
	return results
}
