package serviceslayer

import (
	"fmt"
	"strings"
	"time"

	"github.com/renace/rnv-go-api/config"
	"gorm.io/gorm"
)

const (
	waDivider     = "━━━━━━━━━━━━━━━━"
	waDividerThin = "────────────────"
)

// WAReportEnvelope wraps report body with branded header/footer.
func WAReportEnvelope(db *gorm.DB, cfg *config.Config, title, subtitle string, body string) string {
	label := brandLabel(db, cfg)
	now := time.Now().Format("02/01/2006 · 15:04")

	var b strings.Builder
	b.WriteString(fmt.Sprintf("🟢 *%s · RNV Manager*\n", strings.ToUpper(label)))
	if subtitle != "" {
		b.WriteString("_")
		b.WriteString(subtitle)
		b.WriteString("_\n")
	}
	b.WriteString(fmt.Sprintf("📅 %s\n\n", now))
	b.WriteString(waDivider)
	b.WriteString("\n\n")
	b.WriteString(body)
	b.WriteString("\n\n")
	b.WriteString(waDivider)
	b.WriteString("\n")
	b.WriteString(wAFooter())
	return strings.TrimSpace(b.String())
}

// WAAlertEnvelope formats automatic alerts (VPS, servicios).
func WAAlertEnvelope(db *gorm.DB, cfg *config.Config, icon, alertType, title, body string) string {
	label := brandLabel(db, cfg)
	now := time.Now().Format("02/01/2006 · 15:04")

	var b strings.Builder
	b.WriteString(fmt.Sprintf("%s *%s · %s*\n", icon, strings.ToUpper(label), alertType))
	b.WriteString(fmt.Sprintf("📅 %s\n\n", now))
	b.WriteString(waDivider)
	b.WriteString("\n\n")
	b.WriteString(fmt.Sprintf("*%s*\n\n", title))
	b.WriteString(body)
	b.WriteString("\n\n")
	b.WriteString(waDivider)
	b.WriteString("\n")
	b.WriteString(wAFooter())
	return strings.TrimSpace(b.String())
}

func brandLabel(db *gorm.DB, cfg *config.Config) string {
	wc := ResolveWhatsAppConfig(db, cfg)
	if wc.SenderLabel != "" {
		return wc.SenderLabel
	}
	return "Renace"
}

func wAFooter() string {
	return "_rnv.renace.tech_"
}

func waSection(emoji, title string) string {
	return fmt.Sprintf("\n%s *%s*\n", emoji, strings.ToUpper(title))
}

func waField(label, value string) string {
	return fmt.Sprintf("▸ *%s:* %s\n", label, value)
}

func waRow(icon, text string) string {
	return fmt.Sprintf("%s %s\n", icon, text)
}

func waBullet(text string) string {
	return fmt.Sprintf("  • %s\n", text)
}

func waTreeLast(label, value string) string {
	return fmt.Sprintf("└ *%s:* %s\n", label, value)
}

func waTreeMid(label, value string) string {
	return fmt.Sprintf("├ *%s:* %s\n", label, value)
}

func waMore(n int) string {
	if n <= 0 {
		return ""
	}
	return fmt.Sprintf("  _…y %d más_\n", n)
}

func waStatusBadge(status string) string {
	s := strings.ToLower(strings.TrimSpace(status))
	switch s {
	case "online", "running", "open":
		return "🟢 " + strings.ToUpper(s)
	case "offline", "stopped", "down", "close":
		return "🔴 " + strings.ToUpper(s)
	default:
		return "🟡 " + strings.ToUpper(s)
	}
}

func waMoney(v float64) string {
	return fmt.Sprintf("*$%.2f*", v)
}

// FormatServiceOfflineAlert builds a structured service-down message.
func FormatServiceOfflineAlert(db *gorm.DB, cfg *config.Config, name, vpsName, url, method string) string {
	var body strings.Builder
	body.WriteString(waField("Servicio", "*"+name+"*"))
	body.WriteString(waField("Estado", "🔴 *OFFLINE*"))
	if vpsName != "" {
		body.WriteString(waField("VPS", vpsName))
	}
	if url != "" {
		body.WriteString(waField("URL", url))
	}
	if method != "" {
		body.WriteString(waField("Chequeo", method))
	}
	return WAAlertEnvelope(db, cfg, "🔴", "Alerta", "Servicio sin respuesta", body.String())
}

// FormatServiceOnlineAlert builds service recovery message.
func FormatServiceOnlineAlert(db *gorm.DB, cfg *config.Config, name, vpsName, method string) string {
	var body strings.Builder
	body.WriteString(waField("Servicio", "*"+name+"*"))
	body.WriteString(waField("Estado", "🟢 *ONLINE*"))
	if vpsName != "" {
		body.WriteString(waField("VPS", vpsName))
	}
	if method != "" {
		body.WriteString(waField("Chequeo", method))
	}
	return WAAlertEnvelope(db, cfg, "🟢", "Recuperado", "Servicio operativo de nuevo", body.String())
}

// FormatVPSAlert builds VPS status change message.
func FormatVPSAlert(db *gorm.DB, cfg *config.Config, name, ip, status string) string {
	offline := strings.ToLower(status) == "offline"
	icon := "🟢"
	alertType := "Recuperado"
	title := "VPS en línea"
	state := "🟢 *ONLINE*"
	if offline {
		icon = "🔴"
		alertType = "Alerta"
		title = "VPS sin respuesta"
		state = "🔴 *OFFLINE*"
	}
	var body strings.Builder
	body.WriteString(waField("Servidor", "*"+name+"*"))
	body.WriteString(waField("Estado", state))
	body.WriteString(waField("IP", ip))
	return WAAlertEnvelope(db, cfg, icon, alertType, title, body.String())
}

// FormatTestMessage builds the WhatsApp test ping.
func FormatTestMessage(db *gorm.DB, cfg *config.Config, instance string) string {
	body := waField("Canal", "WhatsApp Evolution API") +
		waField("Instancia", instance) +
		waField("Remitente", "+1 809 348 7921") +
		waField("Estado", "✅ *Conectado*")
	return WAReportEnvelope(db, cfg, "Test", "Canal de notificaciones activo", body)
}
