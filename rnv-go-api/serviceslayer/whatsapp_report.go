package serviceslayer

import (
	"fmt"
	"strings"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

const whatsAppMaxLen = 3800

// ReportOptions scopes a WhatsApp report to a client, VPS or service.
type ReportOptions struct {
	ClientID    string
	ClientName  string
	VpsID       string
	VpsName     string
	ServiceID   string
	ServiceName string
}

// DefaultNotifyRecipients returns configured admin WhatsApp numbers.
func DefaultNotifyRecipients(db *gorm.DB, cfg *config.Config) []string {
	return ResolveWhatsAppConfig(db, cfg).NotifyNums
}

// SendWhatsAppTo sends to one number, or all notify numbers if to is empty.
func SendWhatsAppTo(db *gorm.DB, cfg *config.Config, to, text string) ([]string, error) {
	wc := ResolveWhatsAppConfig(db, cfg)
	if !wc.IsConfigured() {
		return nil, fmt.Errorf("WhatsApp/Evolution API no configurado")
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, fmt.Errorf("mensaje vacío")
	}

	targets := []string{}
	if to != "" {
		targets = []string{NormalizeWhatsAppNumber(to)}
	} else {
		targets = wc.NotifyNums
	}
	if len(targets) == 0 || targets[0] == "" {
		return nil, fmt.Errorf("sin destinatario — configura WHATSAPP_NOTIFY_NUMBERS")
	}

	sent := []string{}
	var lastErr error
	for _, num := range targets {
		if num == "" {
			continue
		}
		if err := SendWhatsApp(db, cfg, num, text); err != nil {
			lastErr = err
		} else {
			sent = append(sent, num)
		}
	}
	if len(sent) == 0 && lastErr != nil {
		return nil, lastErr
	}
	return sent, nil
}

// BuildWhatsAppReport builds a formatted report for WhatsApp.
func BuildWhatsAppReport(db *gorm.DB, cfg *config.Config, reportType string, opts ReportOptions) (string, error) {
	reportType = strings.ToLower(strings.TrimSpace(reportType))
	now := time.Now()
	header := fmt.Sprintf("*📋 RNV Manager*\n_%s_\n\n", now.Format("02/01/2006 15:04"))

	var body string
	var err error

	switch reportType {
	case "dashboard", "resumen", "summary":
		body, err = reportDashboard(db)
	case "billing", "facturacion", "finanzas":
		body, err = reportBilling(db)
	case "offline", "caidos", "down":
		body, err = reportOffline(db)
	case "topology", "infra", "mapa":
		body, err = reportTopology(db)
	case "workflow", "tareas", "flujo":
		body, err = reportWorkflow(db, opts)
	case "overdue", "morosos", "mora":
		body, err = reportOverdue(db)
	case "vps", "servidores":
		body, err = reportVPS(db, opts)
	case "client", "cliente":
		body, err = reportClient(db, opts)
	case "services", "servicios":
		body, err = reportServices(db, opts)
	default:
		return "", fmt.Errorf("tipo de reporte desconocido: %s (usa: dashboard, billing, offline, topology, workflow, overdue, vps, client, services)", reportType)
	}
	if err != nil {
		return "", err
	}
	return truncateWA(header + body), nil
}

func truncateWA(s string) string {
	if len(s) <= whatsAppMaxLen {
		return s
	}
	return s[:whatsAppMaxLen-40] + "\n\n… _(reporte truncado, ver panel)_"
}

func fmtMoney(v float64) string {
	return fmt.Sprintf("$%.2f", v)
}

func reportDashboard(db *gorm.DB) (string, error) {
	var clients, vpsCount, svcCount int64
	var vpsOnline, vpsOffline int64
	var expenses float64

	db.Model(&models.Client{}).Where("is_active = true").Count(&clients)
	db.Model(&models.VPS{}).Count(&vpsCount)
	db.Model(&models.Service{}).Count(&svcCount)
	db.Model(&models.VPS{}).Where("status = ?", "online").Count(&vpsOnline)
	db.Model(&models.VPS{}).Where("status = ?", "offline").Count(&vpsOffline)
	db.Model(&models.VPS{}).Select("COALESCE(SUM(monthly_cost),0)").Scan(&expenses)

	var revenue float64
	var clList []models.Client
	db.Where("is_active = true").Find(&clList)
	for _, c := range clList {
		revenue += ClientChargeAmount(c)
	}

	offlineList, offlineN := ListOfflineServices(db)

	var b strings.Builder
	b.WriteString("*Resumen general*\n")
	b.WriteString(fmt.Sprintf("👥 Clientes activos: %d\n", clients))
	b.WriteString(fmt.Sprintf("🖥 VPS: %d (%d online, %d offline)\n", vpsCount, vpsOnline, vpsOffline))
	b.WriteString(fmt.Sprintf("⚙️ Servicios: %d (%d offline)\n", svcCount, offlineN))
	b.WriteString(fmt.Sprintf("💰 Ingresos/mes: %s\n", fmtMoney(revenue)))
	b.WriteString(fmt.Sprintf("📉 Gastos VPS/mes: %s\n", fmtMoney(expenses)))
	b.WriteString(fmt.Sprintf("📊 Utilidad neta: %s\n", fmtMoney(revenue-expenses)))
	if offlineN > 0 {
		b.WriteString("\n*Servicios caídos:*\n")
		for i, s := range offlineList {
			if i >= 8 {
				b.WriteString(fmt.Sprintf("… y %d más\n", offlineN-8))
				break
			}
			name, _ := s["name"].(string)
			b.WriteString(fmt.Sprintf("🔴 %s\n", name))
		}
	}
	return b.String(), nil
}

func reportBilling(db *gorm.DB) (string, error) {
	now := time.Now()
	var clients []models.Client
	db.Where("is_active = true").Find(&clients)

	var expenses float64
	db.Model(&models.VPS{}).Select("COALESCE(SUM(monthly_cost),0)").Scan(&expenses)

	var revenue float64
	overdueCount := 0
	var overdueLines []string
	for _, c := range clients {
		revenue += ClientChargeAmount(c)
		if ok, days, amt := ClientOverdueInfo(db, c, now); ok && amt > 0 {
			overdueCount++
			overdueLines = append(overdueLines, fmt.Sprintf("• %s — %s (%d días)", c.Name, fmtMoney(amt), days))
		}
	}

	day := now.Day()
	var upcoming []models.Client
	db.Where("is_active = true AND payment_day BETWEEN ? AND ?", day, day+7).
		Order("payment_day asc").Find(&upcoming)

	var b strings.Builder
	b.WriteString("*Facturación*\n")
	b.WriteString(fmt.Sprintf("Ingresos/mes: %s\n", fmtMoney(revenue)))
	b.WriteString(fmt.Sprintf("Gastos VPS: %s\n", fmtMoney(expenses)))
	b.WriteString(fmt.Sprintf("Utilidad: %s\n", fmtMoney(revenue-expenses)))
	b.WriteString(fmt.Sprintf("Morosos: %d\n", overdueCount))
	if len(overdueLines) > 0 {
		b.WriteString("\n*En mora:*\n")
		for i, line := range overdueLines {
			if i >= 10 {
				b.WriteString(fmt.Sprintf("… y %d más\n", len(overdueLines)-10))
				break
			}
			b.WriteString(line + "\n")
		}
	}
	if len(upcoming) > 0 {
		b.WriteString("\n*Cobros próx. 7 días:*\n")
		for _, c := range upcoming {
			b.WriteString(fmt.Sprintf("• %s — día %d — %s\n", c.Name, c.PaymentDay, fmtMoney(ClientChargeAmount(c))))
		}
	}
	return b.String(), nil
}

func reportOffline(db *gorm.DB) (string, error) {
	list, count := ListOfflineServices(db)
	var b strings.Builder
	b.WriteString(fmt.Sprintf("*Servicios offline (%d)*\n", count))
	if count == 0 {
		b.WriteString("✅ Todos los servicios responden\n")
		return b.String(), nil
	}
	for i, s := range list {
		if i >= 20 {
			b.WriteString(fmt.Sprintf("… y %d más\n", count-20))
			break
		}
		name, _ := s["name"].(string)
		vps, _ := s["vpsName"].(string)
		url, _ := s["url"].(string)
		line := fmt.Sprintf("🔴 %s", name)
		if vps != "" {
			line += " · " + vps
		}
		if url != "" {
			line += "\n   " + url
		}
		b.WriteString(line + "\n")
	}
	return b.String(), nil
}

func reportTopology(db *gorm.DB) (string, error) {
	var vpsList []models.VPS
	var services []models.Service
	db.Preload("Client").Find(&vpsList)
	db.Find(&services)

	var b strings.Builder
	b.WriteString("*Mapa de infraestructura*\n")
	for i, v := range vpsList {
		if i >= 12 {
			b.WriteString(fmt.Sprintf("… y %d VPS más\n", len(vpsList)-12))
			break
		}
		icon := "🟢"
		if v.Status == "offline" {
			icon = "🔴"
		}
		svcN := 0
		for _, s := range services {
			if s.VpsID != nil && *s.VpsID == v.ID {
				svcN++
			}
		}
		client := ""
		if v.Client != nil {
			client = " · " + v.Client.Name
		}
		b.WriteString(fmt.Sprintf("%s *%s* (%s) — %d svc%s\n", icon, v.Name, v.IPAddress, svcN, client))
	}
	return b.String(), nil
}

func reportWorkflow(db *gorm.DB, opts ReportOptions) (string, error) {
	q := db.Preload("Service").Where("status = ? AND type = ?", "pending", "work").Order("scheduled_at asc")
	if opts.ServiceID != "" {
		q = q.Where("service_id = ?", opts.ServiceID)
	}
	var tasks []models.ScheduledTask
	q.Limit(40).Find(&tasks)

	now := time.Now()
	overdue, stale := 0, 0
	var b strings.Builder
	b.WriteString("*Mi Flujo — tareas pendientes*\n")
	if len(tasks) == 0 {
		b.WriteString("✅ Sin tareas de trabajo pendientes\n")
		return b.String(), nil
	}
	for _, t := range tasks {
		days := int(now.Sub(t.ScheduledAt).Hours() / 24)
		svc := "sin app"
		if t.Service != nil {
			svc = t.Service.Name
		}
		prefix := "•"
		if t.ScheduledAt.Before(now) {
			prefix = "⚠️"
			overdue++
		} else if days > 3 {
			prefix = "⏳"
			stale++
		}
		b.WriteString(fmt.Sprintf("%s %s [%s] (%d d)\n", prefix, t.Title, svc, days))
	}
	b.WriteString(fmt.Sprintf("\nTotal: %d | Vencidas: %d | Estancadas: %d\n", len(tasks), overdue, stale))
	return b.String(), nil
}

func reportOverdue(db *gorm.DB) (string, error) {
	now := time.Now()
	var clients []models.Client
	db.Where("is_active = true").Find(&clients)

	var lines []string
	for _, c := range clients {
		ok, days, amt := ClientOverdueInfo(db, c, now)
		if ok && amt > 0 {
			lines = append(lines, fmt.Sprintf("• *%s* — %s — %d días de mora", c.Name, fmtMoney(amt), days))
		}
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("*Clientes morosos (%d)*\n", len(lines)))
	if len(lines) == 0 {
		b.WriteString("✅ Sin mora activa\n")
		return b.String(), nil
	}
	for i, line := range lines {
		if i >= 15 {
			b.WriteString(fmt.Sprintf("… y %d más\n", len(lines)-15))
			break
		}
		b.WriteString(line + "\n")
	}
	return b.String(), nil
}

func reportVPS(db *gorm.DB, opts ReportOptions) (string, error) {
	var list []models.VPS
	q := db.Preload("Client")
	if opts.VpsID != "" {
		q = q.Where("id = ?", opts.VpsID)
	} else if opts.VpsName != "" {
		q = q.Where("name ILIKE ?", "%"+opts.VpsName+"%")
	}
	q.Order("name asc").Find(&list)
	if len(list) == 0 {
		return "", fmt.Errorf("VPS no encontrado")
	}

	var b strings.Builder
	if len(list) == 1 {
		v := list[0]
		icon := "🟢"
		if v.Status == "offline" {
			icon = "🔴"
		}
		b.WriteString(fmt.Sprintf("*VPS %s*\n", v.Name))
		b.WriteString(fmt.Sprintf("%s Estado: %s\n", icon, v.Status))
		b.WriteString(fmt.Sprintf("IP: %s:%d\n", v.IPAddress, v.SSHPort))
		b.WriteString(fmt.Sprintf("Costo/mes: %s\n", fmtMoney(v.MonthlyCost)))
		if v.Client != nil {
			b.WriteString(fmt.Sprintf("Cliente: %s\n", v.Client.Name))
		}
		var svcs []models.Service
		db.Where("vps_id = ?", v.ID).Find(&svcs)
		b.WriteString(fmt.Sprintf("\nServicios (%d):\n", len(svcs)))
		for _, s := range svcs {
			st := s.Status
			if st == "stopped" {
				st = "🔴 " + st
			}
			b.WriteString(fmt.Sprintf("• %s — %s\n", s.Name, st))
		}
		return b.String(), nil
	}

	b.WriteString("*Servidores VPS*\n")
	for _, v := range list {
		icon := "🟢"
		if v.Status == "offline" {
			icon = "🔴"
		}
		b.WriteString(fmt.Sprintf("%s %s — %s\n", icon, v.Name, v.IPAddress))
	}
	return b.String(), nil
}

func reportClient(db *gorm.DB, opts ReportOptions) (string, error) {
	q := db
	if opts.ClientID != "" {
		q = q.Where("id = ?", opts.ClientID)
	} else if opts.ClientName != "" {
		q = q.Where("name ILIKE ?", "%"+opts.ClientName+"%")
	} else {
		return "", fmt.Errorf("clientId o clientName requerido para reporte de cliente")
	}
	var c models.Client
	if err := q.Preload("VPSList").Preload("Services").First(&c).Error; err != nil {
		return "", fmt.Errorf("cliente no encontrado")
	}

	now := time.Now()
	charge := ClientChargeAmount(c)
	overdue, days, amt := ClientOverdueInfo(db, c, now)

	var b strings.Builder
	b.WriteString(fmt.Sprintf("*Cliente: %s*\n", c.Name))
	if c.CompanyName != nil && *c.CompanyName != "" {
		b.WriteString(fmt.Sprintf("Empresa: %s\n", *c.CompanyName))
	}
	if c.Email != nil {
		b.WriteString(fmt.Sprintf("Email: %s\n", *c.Email))
	}
	b.WriteString(fmt.Sprintf("Ciclo: %s — Cuota: %s\n", ClientBillingCycle(c), fmtMoney(charge)))
	b.WriteString(fmt.Sprintf("Día de pago: %d\n", c.PaymentDay))
	if overdue && amt > 0 {
		b.WriteString(fmt.Sprintf("⚠️ *EN MORA* — %s (%d días)\n", fmtMoney(amt), days))
	} else {
		b.WriteString("✅ Al día\n")
	}
	if len(c.VPSList) > 0 {
		b.WriteString(fmt.Sprintf("\nVPS (%d):\n", len(c.VPSList)))
		for _, v := range c.VPSList {
			b.WriteString(fmt.Sprintf("• %s — %s\n", v.Name, v.Status))
		}
	}
	if len(c.Services) > 0 {
		b.WriteString(fmt.Sprintf("\nServicios (%d):\n", len(c.Services)))
		for _, s := range c.Services {
			b.WriteString(fmt.Sprintf("• %s — %s\n", s.Name, s.Status))
		}
	}
	return b.String(), nil
}

func reportServices(db *gorm.DB, opts ReportOptions) (string, error) {
	q := db.Preload("VPS").Preload("Client")
	if opts.ServiceID != "" {
		q = q.Where("id = ?", opts.ServiceID)
	} else if opts.ServiceName != "" {
		q = q.Where("name ILIKE ?", "%"+opts.ServiceName+"%")
	}
	var list []models.Service
	q.Order("name asc").Limit(25).Find(&list)
	if len(list) == 0 {
		return "", fmt.Errorf("servicio no encontrado")
	}

	if len(list) == 1 {
		s := list[0]
		var b strings.Builder
		b.WriteString(fmt.Sprintf("*Servicio: %s*\n", s.Name))
		b.WriteString(fmt.Sprintf("Tipo: %s — Estado: %s\n", s.Type, s.Status))
		if s.URL != nil {
			b.WriteString(fmt.Sprintf("URL: %s\n", *s.URL))
		}
		if s.VPS != nil {
			b.WriteString(fmt.Sprintf("VPS: %s\n", s.VPS.Name))
		}
		if s.Client != nil {
			b.WriteString(fmt.Sprintf("Cliente: %s\n", s.Client.Name))
		}
		b.WriteString(fmt.Sprintf("Costo/mes: %s\n", fmtMoney(s.MonthlyCost)))
		return b.String(), nil
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("*Servicios (%d)*\n", len(list)))
	for _, s := range list {
		st := s.Status
		if st == "stopped" {
			st = "🔴 offline"
		}
		b.WriteString(fmt.Sprintf("• %s — %s\n", s.Name, st))
	}
	return b.String(), nil
}

// SendWhatsAppReport builds and sends a report.
func SendWhatsAppReport(db *gorm.DB, cfg *config.Config, reportType, to string, opts ReportOptions) ([]string, string, error) {
	text, err := BuildWhatsAppReport(db, cfg, reportType, opts)
	if err != nil {
		return nil, "", err
	}
	sent, err := SendWhatsAppTo(db, cfg, to, text)
	return sent, text, err
}
