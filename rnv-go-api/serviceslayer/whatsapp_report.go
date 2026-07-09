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

var reportMeta = map[string]struct{ title, subtitle string }{
	"dashboard": {"Resumen general", "Panorama del ecosistema"},
	"billing":     {"Facturación", "Pagos, mora y cobros próximos"},
	"offline":     {"Servicios caídos", "Estado de disponibilidad"},
	"topology":    {"Infraestructura", "Mapa de VPS y servicios"},
	"workflow":    {"Mi Flujo", "Tareas de trabajo pendientes"},
	"overdue":     {"Clientes morosos", "Pagos vencidos"},
	"vps":         {"Servidores VPS", "Estado y detalle"},
	"client":      {"Ficha de cliente", "Datos y servicios asignados"},
	"services":    {"Servicios", "Estado y asignación"},
}

// BuildWhatsAppReport builds a formatted report for WhatsApp.
func BuildWhatsAppReport(db *gorm.DB, cfg *config.Config, reportType string, opts ReportOptions) (string, error) {
	reportType = strings.ToLower(strings.TrimSpace(reportType))
	// aliases
	switch reportType {
	case "resumen", "summary":
		reportType = "dashboard"
	case "facturacion", "finanzas":
		reportType = "billing"
	case "caidos", "down":
		reportType = "offline"
	case "infra", "mapa":
		reportType = "topology"
	case "tareas", "flujo":
		reportType = "workflow"
	case "morosos", "mora":
		reportType = "overdue"
	case "servidores":
		reportType = "vps"
	case "cliente":
		reportType = "client"
	case "servicios":
		reportType = "services"
	}

	var body string
	var err error

	switch reportType {
	case "dashboard":
		body, err = reportDashboard(db)
	case "billing":
		body, err = reportBilling(db)
	case "offline":
		body, err = reportOffline(db)
	case "topology":
		body, err = reportTopology(db)
	case "workflow":
		body, err = reportWorkflow(db, opts)
	case "overdue":
		body, err = reportOverdue(db)
	case "vps":
		body, err = reportVPS(db, opts)
	case "client":
		body, err = reportClient(db, opts)
	case "services":
		body, err = reportServices(db, opts)
	default:
		return "", fmt.Errorf("tipo de reporte desconocido: %s", reportType)
	}
	if err != nil {
		return "", err
	}

	meta := reportMeta[reportType]
	if meta.title == "" {
		meta.title = "Reporte"
	}
	msg := WAReportEnvelope(db, cfg, meta.title, meta.subtitle, body)
	return truncateWA(msg), nil
}

func truncateWA(s string) string {
	if len(s) <= whatsAppMaxLen {
		return s
	}
	return s[:whatsAppMaxLen-40] + "\n\n… _(reporte truncado — ver panel)_"
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
	b.WriteString(waSection("📊", "Indicadores"))
	b.WriteString(waTreeMid("Clientes activos", fmt.Sprintf("%d", clients)))
	b.WriteString(waTreeMid("VPS", fmt.Sprintf("%d  (%d 🟢 · %d 🔴)", vpsCount, vpsOnline, vpsOffline)))
	b.WriteString(waTreeMid("Servicios", fmt.Sprintf("%d  (%d 🔴 offline)", svcCount, offlineN)))
	b.WriteString(waTreeLast("Utilidad neta", waMoney(revenue-expenses)))

	b.WriteString(waSection("💰", "Finanzas mensuales"))
	b.WriteString(waTreeMid("Ingresos", waMoney(revenue)))
	b.WriteString(waTreeLast("Gastos VPS", waMoney(expenses)))

	if offlineN > 0 {
		b.WriteString(waSection("🔴", fmt.Sprintf("Servicios caídos (%d)", offlineN)))
		for i, s := range offlineList {
			if i >= 8 {
				b.WriteString(waMore(offlineN - 8))
				break
			}
			name, _ := s["name"].(string)
			b.WriteString(waBullet("*" + name + "*"))
		}
	} else {
		b.WriteString(waSection("✅", "Disponibilidad"))
		b.WriteString(waRow("", "Todos los servicios responden"))
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
			overdueLines = append(overdueLines, fmt.Sprintf("*%s*\n     %s · _%d días de mora_", c.Name, waMoney(amt), days))
		}
	}

	day := now.Day()
	var upcoming []models.Client
	db.Where("is_active = true AND payment_day BETWEEN ? AND ?", day, day+7).
		Order("payment_day asc").Find(&upcoming)

	var b strings.Builder
	b.WriteString(waSection("💰", "Resumen financiero"))
	b.WriteString(waTreeMid("Ingresos/mes", waMoney(revenue)))
	b.WriteString(waTreeMid("Gastos VPS", waMoney(expenses)))
	b.WriteString(waTreeMid("Utilidad", waMoney(revenue-expenses)))
	b.WriteString(waTreeLast("Morosos", fmt.Sprintf("%d", overdueCount)))

	if len(overdueLines) > 0 {
		b.WriteString(waSection("⚠️", fmt.Sprintf("En mora (%d)", len(overdueLines))))
		for i, line := range overdueLines {
			if i >= 10 {
				b.WriteString(waMore(len(overdueLines) - 10))
				break
			}
			b.WriteString(waBullet(line))
		}
	} else {
		b.WriteString(waSection("✅", "Cobros"))
		b.WriteString(waRow("", "Sin clientes en mora"))
	}

	if len(upcoming) > 0 {
		b.WriteString(waSection("📅", "Próximos 7 días"))
		for _, c := range upcoming {
			b.WriteString(waBullet(fmt.Sprintf("*%s* — día *%d* — %s", c.Name, c.PaymentDay, waMoney(ClientChargeAmount(c)))))
		}
	}
	return b.String(), nil
}

func reportOffline(db *gorm.DB) (string, error) {
	list, count := ListOfflineServices(db)
	var b strings.Builder
	if count == 0 {
		b.WriteString(waSection("✅", "Todo operativo"))
		b.WriteString(waRow("", "No hay servicios caídos en este momento"))
		return b.String(), nil
	}

	b.WriteString(waSection("🔴", fmt.Sprintf("Sin respuesta (%d)", count)))
	for i, s := range list {
		if i >= 15 {
			b.WriteString(waMore(count - 15))
			break
		}
		name, _ := s["name"].(string)
		vps, _ := s["vpsName"].(string)
		url, _ := s["url"].(string)
		block := fmt.Sprintf("*%s*", name)
		if vps != "" {
			block += "\n     VPS → " + vps
		}
		if url != "" {
			block += "\n     " + url
		}
		b.WriteString(waBullet(block))
		if i < len(list)-1 && i < 14 {
			b.WriteString(waDividerThin + "\n")
		}
	}
	return b.String(), nil
}

func reportTopology(db *gorm.DB) (string, error) {
	var vpsList []models.VPS
	var services []models.Service
	db.Preload("Client").Order("name asc").Find(&vpsList)
	db.Find(&services)

	var b strings.Builder
	b.WriteString(waSection("🗺️", fmt.Sprintf("VPS (%d)", len(vpsList))))
	for i, v := range vpsList {
		if i >= 12 {
			b.WriteString(waMore(len(vpsList) - 12))
			break
		}
		svcN := 0
		for _, s := range services {
			if s.VpsID != nil && *s.VpsID == v.ID {
				svcN++
			}
		}
		client := ""
		if v.Client != nil {
			client = "\n     Cliente → " + v.Client.Name
		}
		line := fmt.Sprintf("%s *%s*\n     %s · %d servicios%s",
			map[bool]string{true: "🔴", false: "🟢"}[v.Status == "offline"],
			v.Name, v.IPAddress, svcN, client)
		b.WriteString(waBullet(line))
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
	if len(tasks) == 0 {
		b.WriteString(waSection("✅", "Cola vacía"))
		b.WriteString(waRow("", "No hay tareas de trabajo pendientes"))
		return b.String(), nil
	}

	b.WriteString(waSection("📋", fmt.Sprintf("Pendientes (%d)", len(tasks))))
	for i, t := range tasks {
		days := int(now.Sub(t.ScheduledAt).Hours() / 24)
		svc := "sin app"
		if t.Service != nil {
			svc = t.Service.Name
		}
		icon := "•"
		if t.ScheduledAt.Before(now) {
			icon = "⚠️"
			overdue++
		} else if days > 3 {
			icon = "⏳"
			stale++
		}
		block := fmt.Sprintf("%s *%s*\n     App → %s · _%d días_", icon, t.Title, svc, days)
		b.WriteString(waBullet(block))
		if i < len(tasks)-1 && i < 39 {
			b.WriteString(waDividerThin + "\n")
		}
	}

	b.WriteString(waSection("📈", "Totales"))
	b.WriteString(waTreeMid("Vencidas", fmt.Sprintf("%d", overdue)))
	b.WriteString(waTreeMid("Estancadas (+3d)", fmt.Sprintf("%d", stale)))
	b.WriteString(waTreeLast("Total", fmt.Sprintf("%d", len(tasks))))
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
			lines = append(lines, fmt.Sprintf("*%s*\n     Deuda: %s · _%d días_", c.Name, waMoney(amt), days))
		}
	}

	var b strings.Builder
	if len(lines) == 0 {
		b.WriteString(waSection("✅", "Al día"))
		b.WriteString(waRow("", "No hay clientes en mora"))
		return b.String(), nil
	}

	b.WriteString(waSection("⚠️", fmt.Sprintf("Morosos (%d)", len(lines))))
	for i, line := range lines {
		if i >= 12 {
			b.WriteString(waMore(len(lines) - 12))
			break
		}
		b.WriteString(waBullet(line))
		if i < len(lines)-1 && i < 11 {
			b.WriteString(waDividerThin + "\n")
		}
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
		b.WriteString(waSection("🖥️", v.Name))
		b.WriteString(waTreeMid("Estado", waStatusBadge(v.Status)))
		b.WriteString(waTreeMid("IP", fmt.Sprintf("%s:%d", v.IPAddress, v.SSHPort)))
		b.WriteString(waTreeMid("Costo/mes", waMoney(v.MonthlyCost)))
		if v.Client != nil {
			b.WriteString(waTreeMid("Cliente", v.Client.Name))
		}
		var svcs []models.Service
		db.Where("vps_id = ?", v.ID).Find(&svcs)
		b.WriteString(waTreeLast("Servicios", fmt.Sprintf("%d", len(svcs))))

		if len(svcs) > 0 {
			b.WriteString(waSection("⚙️", "Servicios en este VPS"))
			for _, s := range svcs {
				b.WriteString(waBullet(fmt.Sprintf("*%s* — %s", s.Name, waStatusBadge(s.Status))))
			}
		}
		return b.String(), nil
	}

	b.WriteString(waSection("🖥️", fmt.Sprintf("Servidores (%d)", len(list))))
	for _, v := range list {
		icon := "🟢"
		if v.Status == "offline" {
			icon = "🔴"
		}
		b.WriteString(waBullet(fmt.Sprintf("%s *%s* — %s", icon, v.Name, v.IPAddress)))
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
	b.WriteString(waSection("👤", c.Name))
	if c.CompanyName != nil && *c.CompanyName != "" {
		b.WriteString(waField("Empresa", *c.CompanyName))
	}
	if c.Email != nil && *c.Email != "" {
		b.WriteString(waField("Email", *c.Email))
	}
	b.WriteString(waField("Ciclo", ClientBillingCycle(c)))
	b.WriteString(waField("Cuota", waMoney(charge)))
	b.WriteString(waField("Día de pago", fmt.Sprintf("%d", c.PaymentDay)))

	if overdue && amt > 0 {
		b.WriteString(waField("Estado", fmt.Sprintf("⚠️ *EN MORA* — %s (%d días)", waMoney(amt), days)))
	} else {
		b.WriteString(waField("Estado", "✅ *Al día*"))
	}

	if len(c.VPSList) > 0 {
		b.WriteString(waSection("🖥️", fmt.Sprintf("VPS (%d)", len(c.VPSList))))
		for _, v := range c.VPSList {
			b.WriteString(waBullet(fmt.Sprintf("*%s* — %s", v.Name, waStatusBadge(v.Status))))
		}
	}
	if len(c.Services) > 0 {
		b.WriteString(waSection("⚙️", fmt.Sprintf("Servicios (%d)", len(c.Services))))
		for _, s := range c.Services {
			b.WriteString(waBullet(fmt.Sprintf("*%s* — %s", s.Name, waStatusBadge(s.Status))))
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
		b.WriteString(waSection("⚙️", s.Name))
		b.WriteString(waTreeMid("Tipo", s.Type))
		b.WriteString(waTreeMid("Estado", waStatusBadge(s.Status)))
		if s.URL != nil && *s.URL != "" {
			b.WriteString(waTreeMid("URL", *s.URL))
		}
		if s.VPS != nil {
			b.WriteString(waTreeMid("VPS", s.VPS.Name))
		}
		if s.Client != nil {
			b.WriteString(waTreeMid("Cliente", s.Client.Name))
		}
		b.WriteString(waTreeLast("Costo/mes", waMoney(s.MonthlyCost)))
		return b.String(), nil
	}

	var b strings.Builder
	b.WriteString(waSection("⚙️", fmt.Sprintf("Listado (%d)", len(list))))
	for _, s := range list {
		b.WriteString(waBullet(fmt.Sprintf("*%s* — %s", s.Name, waStatusBadge(s.Status))))
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
