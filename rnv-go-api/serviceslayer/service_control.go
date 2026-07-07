package serviceslayer

import (
	"fmt"
	"strings"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
)

// ServiceControlAction is start | stop | restart | status
func ServiceControlCommand(svc models.Service, action string) (string, error) {
	action = strings.ToLower(strings.TrimSpace(action))
	if action == "" {
		action = "status"
	}

	name := strings.TrimSpace(svc.Name)
	safe := strings.NewReplacer(";", "", "&", "", "|", "", "`", "", "$", "", "(", "", ")", "").Replace(name)
	if safe == "" {
		return "", fmt.Errorf("nombre de servicio inválido")
	}

	typ := strings.ToLower(svc.Type)
	cfgFile := ""
	if svc.ConfigFile != nil {
		cfgFile = strings.TrimSpace(*svc.ConfigFile)
	}

	switch action {
	case "start", "stop", "restart", "status":
	default:
		return "", fmt.Errorf("acción inválida: %s (usa start, stop, restart, status)", action)
	}

	// Docker / compose (nombre del contenedor en svc.Name)
	if typ == "docker" || strings.Contains(cfgFile, "docker-compose") {
		switch action {
		case "start":
			return fmt.Sprintf("docker start %s 2>&1 || docker compose start %s 2>&1", safe, safe), nil
		case "stop":
			return fmt.Sprintf("docker stop %s 2>&1", safe), nil
		case "restart":
			return fmt.Sprintf("docker restart %s 2>&1 || docker compose restart %s 2>&1", safe, safe), nil
		case "status":
			return fmt.Sprintf("docker ps -a --filter name=%s --format '{{.Names}} {{.Status}}' 2>&1", safe), nil
		}
	}

	switch typ {
	case "odoo":
		unit := safe
		if unit == "" || unit == "odoo" {
			unit = "odoo"
		}
		switch action {
		case "start":
			return fmt.Sprintf("systemctl start %s 2>&1 || docker restart %s 2>&1", unit, safe), nil
		case "stop":
			return fmt.Sprintf("systemctl stop %s 2>&1 || docker stop %s 2>&1", unit, safe), nil
		case "restart":
			return fmt.Sprintf("systemctl restart %s 2>&1 || docker restart %s 2>&1", unit, safe), nil
		case "status":
			return fmt.Sprintf("systemctl is-active %s 2>&1; docker ps -a --filter name=%s 2>&1", unit, safe), nil
		}
	case "postgres", "postgresql":
		switch action {
		case "restart":
			return "systemctl restart postgresql 2>&1 || systemctl restart postgresql@* 2>&1", nil
		case "status":
			return "systemctl is-active postgresql 2>&1", nil
		default:
			return fmt.Sprintf("systemctl %s postgresql 2>&1", action), nil
		}
	case "nginx", "web":
		switch action {
		case "restart":
			return "systemctl reload nginx 2>&1 || systemctl restart nginx 2>&1", nil
		case "status":
			return "systemctl is-active nginx 2>&1", nil
		default:
			return fmt.Sprintf("systemctl %s nginx 2>&1", action), nil
		}
	case "redis":
		switch action {
		case "restart":
			return "systemctl restart redis 2>&1 || docker restart redis 2>&1", nil
		case "status":
			return "systemctl is-active redis 2>&1", nil
		default:
			return fmt.Sprintf("systemctl %s redis 2>&1", action), nil
		}
	}

	// Genérico: intentar docker por nombre
	switch action {
	case "restart":
		return fmt.Sprintf("docker restart %s 2>&1", safe), nil
	case "status":
		return fmt.Sprintf("docker ps -a --filter name=%s 2>&1; systemctl status %s --no-pager 2>&1 | head -5", safe, safe), nil
	default:
		return fmt.Sprintf("docker %s %s 2>&1", action, safe), nil
	}
}

// VPS SSH credentials: MASTER_PASSWORD como fallback de root
func VPSSSHConfig(vps models.VPS, cfg *config.Config) SSHConfig {
	port := vps.SSHPort
	if port == 0 {
		port = 22
	}
	user := vps.SSHUser
	if user == "" {
		user = "root"
	}
	pass := cfg.MasterPassword
	return SSHConfig{
		Host:     vps.IPAddress,
		Port:     port,
		Username: user,
		Password: pass,
	}
}
