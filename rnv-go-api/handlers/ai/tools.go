package ai

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type toolExecutor struct {
	db     *gorm.DB
	cfg    *config.Config
	odoo   *serviceslayer.OdooClient
	odooOK bool
}

type executedFunction struct {
	Name   string      `json:"name"`
	Args   interface{} `json:"args,omitempty"`
	Result interface{} `json:"result"`
}

func newToolExecutor(db *gorm.DB, cfg *config.Config) *toolExecutor {
	te := &toolExecutor{db: db, cfg: cfg}
	client, err := serviceslayer.NewOdooClient(db, cfg)
	if err == nil {
		te.odoo = client
		te.odooOK = true
	}
	return te
}

func (te *toolExecutor) execute(name string, args map[string]interface{}) executedFunction {
	result := executedFunction{Name: name, Args: args}

	switch name {
	case "odoo_test_connection":
		result.Result = te.odooTest()
	case "odoo_search_products":
		result.Result = te.odooSearchProducts(args)
	case "odoo_get_product":
		result.Result = te.odooGetProduct(args)
	case "odoo_create_product":
		result.Result = te.odooCreateProduct(args)
	case "odoo_update_product":
		result.Result = te.odooUpdateProduct(args)
	case "odoo_search_partners":
		result.Result = te.odooSearchPartners(args)
	case "odoo_list_categories":
		result.Result = te.odooListCategories(args)
	case "rnv_search":
		result.Result = te.rnvSearch(args)
	case "rnv_list_clients":
		result.Result = te.rnvListClients(args)
	case "rnv_get_client":
		result.Result = te.rnvGetClient(args)
	case "rnv_create_client":
		result.Result = te.rnvCreateClient(args)
	case "rnv_update_client":
		result.Result = te.rnvUpdateClient(args)
	case "rnv_list_vps":
		result.Result = te.rnvListVPS(args)
	case "rnv_get_vps":
		result.Result = te.rnvGetVPS(args)
	case "rnv_list_services":
		result.Result = te.rnvListServices(args)
	case "rnv_get_service":
		result.Result = te.rnvGetService(args)
	case "rnv_assign_service":
		result.Result = te.rnvAssignService(args)
	case "rnv_dashboard_stats":
		result.Result = te.rnvDashboardStats()
	case "rnv_billing_summary":
		result.Result = te.rnvBillingSummary()
	case "rnv_list_payments":
		result.Result = te.rnvListPayments(args)
	case "rnv_create_payment":
		result.Result = te.rnvCreatePayment(args)
	case "rnv_overdue_clients":
		result.Result = te.rnvOverdueClients()
	case "rnv_service_control":
		result.Result = te.rnvServiceControl(args)
	case "rnv_record_payment":
		result.Result = te.rnvRecordPayment(args)
	case "rnv_schedule_task":
		result.Result = te.rnvScheduleTask(args)
	case "rnv_list_calendar":
		result.Result = te.rnvListCalendar(args)
	case "rnv_list_scheduled_tasks":
		result.Result = te.rnvListScheduledTasks(args)
	case "rnv_workflow":
		result.Result = te.rnvWorkflow(args)
	case "rnv_complete_task":
		result.Result = te.rnvCompleteTask(args)
	case "rnv_probe_url":
		result.Result = te.rnvProbeURL(args)
	case "rnv_create_service":
		result.Result = te.rnvCreateService(args)
	case "rnv_update_service":
		result.Result = te.rnvUpdateService(args)
	case "rnv_scan_services":
		result.Result = te.rnvScanServices(args)
	case "rnv_dns_lookup":
		result.Result = te.rnvDNSLookup(args)
	case "rnv_send_email":
		result.Result = te.rnvSendEmail(args)
	case "rnv_send_whatsapp":
		result.Result = te.rnvSendWhatsApp(args)
	case "rnv_whatsapp_report":
		result.Result = te.rnvWhatsAppReport(args)
	case "rnv_billing_remind":
		result.Result = te.rnvBillingRemind(args)
	case "rnv_service_health":
		result.Result = te.rnvServiceHealth(args)
	case "rnv_list_offline_services":
		result.Result = te.rnvListOfflineServices(args)
	case "rnv_topology":
		result.Result = te.rnvTopology(args)
	default:
		result.Result = map[string]interface{}{"success": false, "error": "función desconocida: " + name}
	}
	return result
}

// ── Odoo tools ──────────────────────────────────────────────────────────────

func (te *toolExecutor) odooTest() map[string]interface{} {
	if !te.odooOK {
		oc := serviceslayer.ResolveOdooConfig(te.db, te.cfg)
		return map[string]interface{}{
			"success": false,
			"error":   "Odoo no configurado. Ve a Ajustes y configura odoo_url, odoo_db, odoo_user, odoo_key.",
			"config": map[string]interface{}{
				"hasUrl": oc.URL != "", "hasDB": oc.DB != "",
				"hasUser": oc.Username != "", "hasKey": oc.APIKey != "",
			},
		}
	}
	info, err := te.odoo.TestConnection()
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{"success": true, "data": info}
}

func (te *toolExecutor) odooSearchProducts(args map[string]interface{}) map[string]interface{} {
	if !te.odooOK {
		return map[string]interface{}{"success": false, "error": "Odoo no configurado"}
	}
	query := strArg(args, "query")
	limit := intArg(args, "limit", 20)
	products, err := te.odoo.SearchProducts(query, limit)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{"success": true, "count": len(products), "products": simplifyProducts(products)}
}

func (te *toolExecutor) odooGetProduct(args map[string]interface{}) map[string]interface{} {
	if !te.odooOK {
		return map[string]interface{}{"success": false, "error": "Odoo no configurado"}
	}
	id := intArg(args, "id", 0)
	if id <= 0 {
		return map[string]interface{}{"success": false, "error": "id requerido"}
	}
	product, err := te.odoo.GetProduct(id)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{"success": true, "product": simplifyProduct(product)}
}

func (te *toolExecutor) odooCreateProduct(args map[string]interface{}) map[string]interface{} {
	if !te.odooOK {
		return map[string]interface{}{"success": false, "error": "Odoo no configurado"}
	}
	name := strArg(args, "name")
	if name == "" {
		return map[string]interface{}{"success": false, "error": "name requerido"}
	}
	values := map[string]interface{}{"name": name}
	if v, ok := args["list_price"]; ok {
		values["list_price"] = toFloat(v)
	}
	if v := strArg(args, "default_code"); v != "" {
		values["default_code"] = v
	}
	if v := strArg(args, "description_sale"); v != "" {
		values["description_sale"] = v
	}
	if v, ok := args["standard_price"]; ok {
		values["standard_price"] = toFloat(v)
	}

	id, err := te.odoo.CreateProduct(values)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	product, _ := te.odoo.GetProduct(id)
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Producto creado con ID %d", id),
		"id":      id,
		"product": simplifyProduct(product),
	}
}

func (te *toolExecutor) odooUpdateProduct(args map[string]interface{}) map[string]interface{} {
	if !te.odooOK {
		return map[string]interface{}{"success": false, "error": "Odoo no configurado"}
	}
	id := intArg(args, "id", 0)
	if id <= 0 {
		return map[string]interface{}{"success": false, "error": "id requerido"}
	}

	values := map[string]interface{}{}
	for _, field := range []string{"name", "default_code", "description_sale"} {
		if v := strArg(args, field); v != "" {
			values[field] = v
		}
	}
	for _, field := range []string{"list_price", "standard_price"} {
		if v, ok := args[field]; ok {
			values[field] = toFloat(v)
		}
	}
	if v, ok := args["active"]; ok {
		values["active"] = v
	}

	if len(values) == 0 {
		return map[string]interface{}{"success": false, "error": "ningún campo para actualizar"}
	}

	ok, err := te.odoo.UpdateProduct(id, values)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	product, _ := te.odoo.GetProduct(id)
	return map[string]interface{}{
		"success": ok,
		"message": fmt.Sprintf("Producto %d actualizado", id),
		"updated": values,
		"product": simplifyProduct(product),
	}
}

func (te *toolExecutor) odooSearchPartners(args map[string]interface{}) map[string]interface{} {
	if !te.odooOK {
		return map[string]interface{}{"success": false, "error": "Odoo no configurado"}
	}
	query := strArg(args, "query")
	limit := intArg(args, "limit", 20)
	partners, err := te.odoo.SearchPartners(query, limit)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{"success": true, "count": len(partners), "partners": partners}
}

func (te *toolExecutor) odooListCategories(args map[string]interface{}) map[string]interface{} {
	if !te.odooOK {
		return map[string]interface{}{"success": false, "error": "Odoo no configurado"}
	}
	limit := intArg(args, "limit", 30)
	cats, err := te.odoo.ListProductCategories(limit)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{"success": true, "count": len(cats), "categories": cats}
}

// ── RNV tools ───────────────────────────────────────────────────────────────

func (te *toolExecutor) rnvSearch(args map[string]interface{}) map[string]interface{} {
	q := strings.TrimSpace(strArg(args, "query"))
	if q == "" {
		return map[string]interface{}{"success": false, "error": "query requerido"}
	}
	limit := intArg(args, "limit", 10)
	like := "%" + q + "%"

	var clients []models.Client
	te.db.Where("name ILIKE ? OR email ILIKE ? OR company_name ILIKE ?", like, like, like).
		Limit(limit).Find(&clients)

	var vpsList []models.VPS
	te.db.Where("name ILIKE ? OR ip_address ILIKE ?", like, like).Limit(limit).Find(&vpsList)

	var services []models.Service
	te.db.Where("name ILIKE ? OR type ILIKE ? OR url ILIKE ?", like, like, like).Limit(limit).Find(&services)

	return map[string]interface{}{
		"success":  true,
		"query":    q,
		"clients":  simplifyClients(clients),
		"vps":      simplifyVPSList(vpsList),
		"services": simplifyServices(services),
	}
}

func (te *toolExecutor) rnvListClients(args map[string]interface{}) map[string]interface{} {
	limit := intArg(args, "limit", 20)
	q := te.db.Model(&models.Client{}).Order("name asc")

	active := true
	if v, ok := args["active"]; ok {
		if b, ok := v.(bool); ok {
			active = b
		}
	}
	q = q.Where("is_active = ?", active)

	if query := strArg(args, "query"); query != "" {
		like := "%" + query + "%"
		q = q.Where("name ILIKE ? OR email ILIKE ?", like, like)
	}

	var clients []models.Client
	q.Limit(limit).Find(&clients)
	return map[string]interface{}{"success": true, "count": len(clients), "clients": simplifyClients(clients)}
}

func (te *toolExecutor) rnvGetClient(args map[string]interface{}) map[string]interface{} {
	var client models.Client
	id := strArg(args, "id")
	name := strArg(args, "name")

	if id != "" {
		if err := te.db.Preload("VPSList").Preload("Services").
			Preload("Payments", func(db *gorm.DB) *gorm.DB {
				return db.Order("date desc").Limit(5)
			}).First(&client, "id = ?", id).Error; err != nil {
			return map[string]interface{}{"success": false, "error": "cliente no encontrado"}
		}
	} else if name != "" {
		if err := te.db.Preload("VPSList").Preload("Services").
			Preload("Payments", func(db *gorm.DB) *gorm.DB {
				return db.Order("date desc").Limit(5)
			}).Where("name ILIKE ?", "%"+name+"%").First(&client).Error; err != nil {
			return map[string]interface{}{"success": false, "error": "cliente no encontrado: " + name}
		}
	} else {
		return map[string]interface{}{"success": false, "error": "id o name requerido"}
	}

	return map[string]interface{}{
		"success": true,
		"client": map[string]interface{}{
			"id": client.ID, "name": client.Name, "email": client.Email,
			"phone": client.Phone, "companyName": client.CompanyName,
			"monthlyFee": client.MonthlyFee, "annualFee": client.AnnualFee,
			"totalMonthlyCost": client.TotalMonthlyCost,
			"billingCycle": client.BillingCycle, "paymentDay": client.PaymentDay,
			"paymentMonth": client.PaymentMonth, "isActive": client.IsActive,
			"currency": client.Currency, "notes": client.Notes,
			"vps":      simplifyVPSList(client.VPSList),
			"services": simplifyServices(client.Services),
			"payments": simplifyPayments(client.Payments),
		},
	}
}

func (te *toolExecutor) rnvCreateClient(args map[string]interface{}) map[string]interface{} {
	name := strArg(args, "name")
	if name == "" {
		return map[string]interface{}{"success": false, "error": "name requerido"}
	}
	client := models.Client{
		Name:       name,
		IsActive:   true,
		Currency:   "USD",
		PaymentDay: intArg(args, "paymentDay", 1),
		BillingCycle: serviceslayer.BillingCycleMonthly,
	}
	if cycle := strArg(args, "billingCycle"); cycle == "annual" {
		client.BillingCycle = serviceslayer.BillingCycleAnnual
	}
	if _, ok := args["paymentMonth"]; ok {
		client.PaymentMonth = intArg(args, "paymentMonth", 1)
	}
	if v := strArg(args, "email"); v != "" {
		client.Email = &v
	}
	if v := strArg(args, "phone"); v != "" {
		client.Phone = &v
	}
	if v := strArg(args, "companyName"); v != "" {
		client.CompanyName = &v
	}
	if v := strArg(args, "notes"); v != "" {
		client.Notes = &v
	}
	if v, ok := args["monthlyFee"]; ok {
		client.MonthlyFee = toFloat(v)
	}
	if v, ok := args["annualFee"]; ok {
		client.AnnualFee = toFloat(v)
	}

	if err := te.db.Create(&client).Error; err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{
		"success": true,
		"message": "Cliente creado: " + client.Name,
		"client":  simplifyClient(client),
	}
}

func (te *toolExecutor) rnvUpdateClient(args map[string]interface{}) map[string]interface{} {
	id := strArg(args, "id")
	if id == "" {
		return map[string]interface{}{"success": false, "error": "id requerido"}
	}
	var client models.Client
	if err := te.db.First(&client, "id = ?", id).Error; err != nil {
		return map[string]interface{}{"success": false, "error": "cliente no encontrado"}
	}

	updates := map[string]interface{}{}
	if v := strArg(args, "name"); v != "" {
		updates["name"] = v
	}
	if v := strArg(args, "email"); v != "" {
		updates["email"] = v
	}
	if v := strArg(args, "phone"); v != "" {
		updates["phone"] = v
	}
	if v := strArg(args, "companyName"); v != "" {
		updates["company_name"] = v
	}
	if v := strArg(args, "notes"); v != "" {
		updates["notes"] = v
	}
	if _, ok := args["monthlyFee"]; ok {
		updates["monthly_fee"] = toFloat(args["monthlyFee"])
	}
	if _, ok := args["paymentDay"]; ok {
		updates["payment_day"] = intArg(args, "paymentDay", client.PaymentDay)
	}
	if _, ok := args["paymentMonth"]; ok {
		updates["payment_month"] = intArg(args, "paymentMonth", client.PaymentMonth)
	}
	if v := strArg(args, "billingCycle"); v != "" {
		updates["billing_cycle"] = v
	}
	if _, ok := args["annualFee"]; ok {
		updates["annual_fee"] = toFloat(args["annualFee"])
	}
	if v, ok := args["isActive"]; ok {
		updates["is_active"] = v
	}

	if len(updates) == 0 {
		return map[string]interface{}{"success": false, "error": "ningún campo para actualizar"}
	}
	if err := te.db.Model(&client).Updates(updates).Error; err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	te.db.First(&client, "id = ?", id)
	return map[string]interface{}{
		"success": true,
		"message": "Cliente actualizado",
		"client":  simplifyClient(client),
	}
}

func (te *toolExecutor) rnvListVPS(args map[string]interface{}) map[string]interface{} {
	q := te.db.Model(&models.VPS{}).Order("name asc")
	if status := strArg(args, "status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if clientID := strArg(args, "clientId"); clientID != "" {
		q = q.Where("client_id = ?", clientID)
	}
	if query := strArg(args, "query"); query != "" {
		like := "%" + query + "%"
		q = q.Where("name ILIKE ? OR ip_address ILIKE ?", like, like)
	}
	var vpsList []models.VPS
	q.Find(&vpsList)
	return map[string]interface{}{"success": true, "count": len(vpsList), "vps": simplifyVPSList(vpsList)}
}

func (te *toolExecutor) rnvGetVPS(args map[string]interface{}) map[string]interface{} {
	var vps models.VPS
	id := strArg(args, "id")
	name := strArg(args, "name")

	if id != "" {
		if err := te.db.Preload("Services").Preload("Client").First(&vps, "id = ?", id).Error; err != nil {
			return map[string]interface{}{"success": false, "error": "VPS no encontrado"}
		}
	} else if name != "" {
		like := "%" + name + "%"
		if err := te.db.Preload("Services").Preload("Client").
			Where("name ILIKE ? OR ip_address ILIKE ?", like, like).First(&vps).Error; err != nil {
			return map[string]interface{}{"success": false, "error": "VPS no encontrado: " + name}
		}
	} else {
		return map[string]interface{}{"success": false, "error": "id o name requerido"}
	}

	out := map[string]interface{}{
		"id": vps.ID, "name": vps.Name, "ipAddress": vps.IPAddress,
		"status": vps.Status, "provider": vps.Provider, "monthlyCost": vps.MonthlyCost,
		"sshUser": vps.SSHUser, "sshPort": vps.SSHPort, "clientId": vps.ClientID,
		"services": simplifyServices(vps.Services),
	}
	if vps.Client != nil {
		out["client"] = vps.Client.Name
	}
	return map[string]interface{}{"success": true, "vps": out}
}

func (te *toolExecutor) rnvListServices(args map[string]interface{}) map[string]interface{} {
	limit := intArg(args, "limit", 30)
	q := te.db.Model(&models.Service{}).Order("name asc")
	if vpsID := strArg(args, "vpsId"); vpsID != "" {
		q = q.Where("vps_id = ?", vpsID)
	}
	if clientID := strArg(args, "clientId"); clientID != "" {
		q = q.Where("client_id = ?", clientID)
	}
	if query := strArg(args, "query"); query != "" {
		like := "%" + query + "%"
		q = q.Where("name ILIKE ? OR type ILIKE ?", like, like)
	}
	var services []models.Service
	q.Limit(limit).Find(&services)
	return map[string]interface{}{"success": true, "count": len(services), "services": simplifyServices(services)}
}

func (te *toolExecutor) rnvGetService(args map[string]interface{}) map[string]interface{} {
	var svc models.Service
	id := strArg(args, "id")
	name := strArg(args, "name")

	if id != "" {
		if err := te.db.Preload("VPS").Preload("Client").First(&svc, "id = ?", id).Error; err != nil {
			return map[string]interface{}{"success": false, "error": "servicio no encontrado"}
		}
	} else if name != "" {
		if err := te.db.Preload("VPS").Preload("Client").
			Where("name ILIKE ?", "%"+name+"%").First(&svc).Error; err != nil {
			return map[string]interface{}{"success": false, "error": "servicio no encontrado: " + name}
		}
	} else {
		return map[string]interface{}{"success": false, "error": "id o name requerido"}
	}

	out := map[string]interface{}{
		"id": svc.ID, "name": svc.Name, "type": svc.Type, "status": svc.Status,
		"port": svc.Port, "url": svc.URL, "monthlyCost": svc.MonthlyCost,
		"vpsId": svc.VpsID, "clientId": svc.ClientID,
	}
	if svc.VPS != nil {
		out["vps"] = svc.VPS.Name
	}
	if svc.Client != nil {
		out["client"] = svc.Client.Name
	}
	return map[string]interface{}{"success": true, "service": out}
}

func (te *toolExecutor) rnvAssignService(args map[string]interface{}) map[string]interface{} {
	serviceID := strArg(args, "serviceId")
	if serviceID == "" {
		return map[string]interface{}{"success": false, "error": "serviceId requerido"}
	}

	var svc models.Service
	if err := te.db.First(&svc, "id = ?", serviceID).Error; err != nil {
		return map[string]interface{}{"success": false, "error": "servicio no encontrado"}
	}

	clientID := strArg(args, "clientId")
	if clientID == "" {
		clientName := strArg(args, "clientName")
		if clientName == "" {
			return map[string]interface{}{"success": false, "error": "clientId o clientName requerido"}
		}
		var client models.Client
		if err := te.db.Where("name ILIKE ?", "%"+clientName+"%").First(&client).Error; err != nil {
			return map[string]interface{}{"success": false, "error": "cliente no encontrado: " + clientName}
		}
		clientID = client.ID
	}

	updates := map[string]interface{}{"client_id": clientID}
	if v, ok := args["monthlyCost"]; ok {
		updates["monthly_cost"] = toFloat(v)
	}
	if err := te.db.Model(&svc).Updates(updates).Error; err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}

	te.db.Preload("Client").First(&svc, "id = ?", serviceID)
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Servicio %s asignado", svc.Name),
		"service": map[string]interface{}{
			"id": svc.ID, "name": svc.Name, "clientId": svc.ClientID,
			"monthlyCost": svc.MonthlyCost,
			"client":      ptrStr(svc.Client),
		},
	}
}

func (te *toolExecutor) rnvDashboardStats() map[string]interface{} {
	var clientCount, vpsCount, serviceCount int64
	var totalExpenses float64

	te.db.Model(&models.Client{}).Where("is_active = true").Count(&clientCount)
	te.db.Model(&models.VPS{}).Count(&vpsCount)
	te.db.Model(&models.Service{}).Count(&serviceCount)
	te.db.Model(&models.VPS{}).Select("COALESCE(SUM(monthly_cost),0)").Scan(&totalExpenses)

	var totalRevenue float64
	var clients []models.Client
	te.db.Where("is_active = true").Find(&clients)
	for _, c := range clients {
		totalRevenue += serviceslayer.ClientChargeAmount(c)
	}

	var running, stopped int64
	te.db.Model(&models.VPS{}).Where("status = ?", "running").Count(&running)
	te.db.Model(&models.VPS{}).Where("status = ?", "stopped").Count(&stopped)

	return map[string]interface{}{
		"success": true,
		"stats": map[string]interface{}{
			"clients":        clientCount,
			"vps":            vpsCount,
			"vpsRunning":     running,
			"vpsStopped":     stopped,
			"services":       serviceCount,
			"monthlyRevenue": totalRevenue,
			"monthlyExpense": totalExpenses,
			"netProfit":      totalRevenue - totalExpenses,
		},
	}
}

func (te *toolExecutor) rnvBillingSummary() map[string]interface{} {
	var clients []models.Client
	te.db.Where("is_active = true").Find(&clients)

	var totalRevenue, totalExpenses float64
	te.db.Model(&models.VPS{}).Select("COALESCE(SUM(monthly_cost),0)").Scan(&totalExpenses)
	for _, c := range clients {
		totalRevenue += serviceslayer.ClientChargeAmount(c)
	}

	now := time.Now()
	day := now.Day()
	var upcoming []models.Client
	te.db.Where("is_active = true AND payment_day BETWEEN ? AND ?", day, day+5).
		Order("payment_day asc").Find(&upcoming)

	upcomingOut := make([]map[string]interface{}, 0, len(upcoming))
	for _, c := range clients {
		upcomingOut = append(upcomingOut, map[string]interface{}{
			"id": c.ID, "name": c.Name, "paymentDay": c.PaymentDay,
			"paymentMonth": c.PaymentMonth, "billingCycle": serviceslayer.ClientBillingCycle(c),
			"amount": serviceslayer.ClientChargeAmount(c),
		})
	}

	return map[string]interface{}{
		"success": true,
		"billing": map[string]interface{}{
			"totalRevenue":     totalRevenue,
			"totalExpenses":    totalExpenses,
			"netProfit":        totalRevenue - totalExpenses,
			"clientCount":      len(clients),
			"upcomingPayments": upcomingOut,
		},
	}
}

func (te *toolExecutor) rnvListPayments(args map[string]interface{}) map[string]interface{} {
	limit := intArg(args, "limit", 20)
	q := te.db.Model(&models.Payment{}).Order("date desc").Preload("Client")
	if clientID := strArg(args, "clientId"); clientID != "" {
		q = q.Where("client_id = ?", clientID)
	}
	var payments []models.Payment
	q.Limit(limit).Find(&payments)
	return map[string]interface{}{"success": true, "count": len(payments), "payments": simplifyPayments(payments)}
}

func (te *toolExecutor) rnvCreatePayment(args map[string]interface{}) map[string]interface{} {
	amount := toFloat(args["amount"])
	if amount <= 0 {
		return map[string]interface{}{"success": false, "error": "amount debe ser mayor a 0"}
	}

	clientID := strArg(args, "clientId")
	if clientID == "" {
		clientName := strArg(args, "clientName")
		if clientName == "" {
			return map[string]interface{}{"success": false, "error": "clientId o clientName requerido"}
		}
		var client models.Client
		if err := te.db.Where("name ILIKE ?", "%"+clientName+"%").First(&client).Error; err != nil {
			return map[string]interface{}{"success": false, "error": "cliente no encontrado: " + clientName}
		}
		clientID = client.ID
	}

	currency := strArg(args, "currency")
	if currency == "" {
		currency = "USD"
	}
	status := strArg(args, "status")
	if status == "" {
		status = "completed"
	}

	payment := models.Payment{
		Amount:   amount,
		Currency: currency,
		Date:     time.Now(),
		Status:   status,
		ClientID: clientID,
	}
	if notes := strArg(args, "notes"); notes != "" {
		payment.Notes = &notes
	}

	if err := te.db.Create(&payment).Error; err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}

	var client models.Client
	te.db.First(&client, "id = ?", clientID)

	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Pago de %.2f %s registrado para %s", amount, currency, client.Name),
		"payment": map[string]interface{}{
			"id": payment.ID, "amount": payment.Amount, "currency": payment.Currency,
			"status": payment.Status, "clientId": payment.ClientID, "client": client.Name,
			"date": payment.Date.Format("2006-01-02"),
		},
	}
}

func (te *toolExecutor) rnvOverdueClients() map[string]interface{} {
	now := time.Now()
	var clients []models.Client
	te.db.Where("is_active = true").Find(&clients)
	overdue := make([]map[string]interface{}, 0)

	for _, c := range clients {
		isOverdue, daysLate, amount := serviceslayer.ClientOverdueInfo(te.db, c, now)
		if !isOverdue {
			continue
		}
		overdue = append(overdue, map[string]interface{}{
			"id": c.ID, "name": c.Name, "paymentDay": c.PaymentDay,
			"paymentMonth": c.PaymentMonth, "billingCycle": serviceslayer.ClientBillingCycle(c),
			"amount": amount, "daysOverdue": daysLate,
		})
	}

	return map[string]interface{}{"success": true, "count": len(overdue), "clients": overdue}
}

func (te *toolExecutor) rnvServiceControl(args map[string]interface{}) map[string]interface{} {
	if te.cfg.MasterPassword == "" {
		return map[string]interface{}{"success": false, "error": "MASTER_PASSWORD no configurado para SSH"}
	}
	serviceID := strArg(args, "serviceId")
	serviceName := strArg(args, "serviceName")
	action := strArg(args, "action")
	if action == "" {
		action = "restart"
	}

	var svc models.Service
	q := te.db.Preload("VPS")
	if serviceID != "" {
		q = q.Where("id = ?", serviceID)
	} else if serviceName != "" {
		q = q.Where("name ILIKE ?", "%"+serviceName+"%")
	} else {
		return map[string]interface{}{"success": false, "error": "serviceId o serviceName requerido"}
	}
	if err := q.First(&svc).Error; err != nil {
		return map[string]interface{}{"success": false, "error": "servicio no encontrado"}
	}
	if svc.VPS == nil && svc.VpsID != nil {
		var vps models.VPS
		if te.db.First(&vps, "id = ?", *svc.VpsID).Error == nil {
			svc.VPS = &vps
		}
	}
	if svc.VPS == nil {
		return map[string]interface{}{"success": false, "error": "servicio sin VPS"}
	}

	cmd, err := serviceslayer.ServiceControlCommand(svc, action)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	sshCfg := serviceslayer.VPSSSHConfig(*svc.VPS, te.cfg)
	result := serviceslayer.SSHExec(sshCfg, cmd, 60)

	return map[string]interface{}{
		"success": result.Success,
		"service": svc.Name,
		"action":  action,
		"host":    svc.VPS.IPAddress,
		"command": cmd,
		"output":  result.Output,
		"error":   result.Error,
	}
}

func (te *toolExecutor) rnvRecordPayment(args map[string]interface{}) map[string]interface{} {
	clientName := strArg(args, "clientName")
	clientID := strArg(args, "clientId")
	if clientID == "" && clientName != "" {
		var cl models.Client
		if te.db.Where("name ILIKE ?", "%"+clientName+"%").First(&cl).Error == nil {
			clientID = cl.ID
		}
	}
	if clientID == "" {
		return map[string]interface{}{"success": false, "error": "clientId o clientName requerido"}
	}
	var cl models.Client
	if err := te.db.First(&cl, "id = ?", clientID).Error; err != nil {
		return map[string]interface{}{"success": false, "error": "cliente no encontrado"}
	}
	amount := toFloat(args["amount"])
	if amount <= 0 {
		amount = serviceslayer.ClientChargeAmount(cl)
	}
	return te.rnvCreatePayment(map[string]interface{}{
		"clientId": clientID, "amount": amount,
		"notes": strArg(args, "notes"),
	})
}

func (te *toolExecutor) rnvScheduleTask(args map[string]interface{}) map[string]interface{} {
	title := strArg(args, "title")
	if title == "" {
		return map[string]interface{}{"success": false, "error": "title requerido"}
	}
	dateStr := strArg(args, "date")
	if dateStr == "" {
		return map[string]interface{}{"success": false, "error": "date requerido (YYYY-MM-DD o YYYY-MM-DDTHH:MM)"}
	}
	scheduledAt, err := time.Parse("2006-01-02T15:04", dateStr)
	if err != nil {
		scheduledAt, err = time.Parse("2006-01-02", dateStr)
		if err != nil {
			return map[string]interface{}{"success": false, "error": "fecha inválida: use YYYY-MM-DD"}
		}
		scheduledAt = time.Date(scheduledAt.Year(), scheduledAt.Month(), scheduledAt.Day(), 9, 0, 0, 0, time.Local)
	}

	taskType := strArg(args, "type")
	if taskType == "" {
		taskType = "reminder"
	}
	task := models.ScheduledTask{
		Title: title, Type: taskType, ScheduledAt: scheduledAt, Status: "pending",
		NotifyEmail: boolArg(args, "notifyEmail", true),
	}
	if desc := strArg(args, "description"); desc != "" {
		task.Description = &desc
	}
	clientID := strArg(args, "clientId")
	if clientID == "" && strArg(args, "clientName") != "" {
		var cl models.Client
		if te.db.Where("name ILIKE ?", "%"+strArg(args, "clientName")+"%").First(&cl).Error == nil {
			clientID = cl.ID
		}
	}
	if clientID != "" {
		task.ClientID = &clientID
	}
	serviceID := strArg(args, "serviceId")
	if serviceID == "" && strArg(args, "serviceName") != "" {
		var svc models.Service
		if te.db.Where("name ILIKE ?", "%"+strArg(args, "serviceName")+"%").First(&svc).Error == nil {
			serviceID = svc.ID
		}
	}
	if serviceID != "" {
		task.ServiceID = &serviceID
		if task.ClientID == nil {
			var svc models.Service
			if te.db.First(&svc, "id = ?", serviceID).Error == nil && svc.ClientID != nil {
				task.ClientID = svc.ClientID
			}
		}
	}

	if err := te.db.Create(&task).Error; err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Recordatorio programado para %s", scheduledAt.Format("2006-01-02 15:04")),
		"task": map[string]interface{}{
			"id": task.ID, "title": task.Title, "type": task.Type,
			"scheduledAt": task.ScheduledAt.Format(time.RFC3339), "status": task.Status,
		},
	}
}

func (te *toolExecutor) rnvListCalendar(args map[string]interface{}) map[string]interface{} {
	from := strArg(args, "from")
	to := strArg(args, "to")
	now := time.Now()
	if from == "" {
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Format("2006-01-02")
	}
	if to == "" {
		to = time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, now.Location()).Format("2006-01-02")
	}

	var clients []models.Client
	te.db.Where("is_active = true").Find(&clients)
	events := []map[string]interface{}{}

	fromT, _ := time.Parse("2006-01-02", from)
	toT, _ := time.Parse("2006-01-02", to)

	for _, cl := range clients {
		for d := fromT; !d.After(toT); d = d.AddDate(0, 0, 1) {
			due := serviceslayer.ClientDueDate(cl, d)
			if due.Format("2006-01-02") == d.Format("2006-01-02") {
				evType := "due"
				if serviceslayer.ClientPaidForPeriod(te.db, cl, due) {
					evType = "paid"
				} else if time.Now().After(due) {
					if o, _, _ := serviceslayer.ClientOverdueInfo(te.db, cl, time.Now()); o {
						evType = "overdue"
					}
				}
				events = append(events, map[string]interface{}{
					"type": evType, "date": due.Format("2006-01-02"),
					"title": "Cobro " + serviceslayer.BillingCycleLabel(cl) + ": " + cl.Name,
					"clientId": cl.ID, "amount": serviceslayer.ClientChargeAmount(cl),
					"billingCycle": serviceslayer.ClientBillingCycle(cl),
				})
			}
		}
	}

	var tasks []models.ScheduledTask
	te.db.Where("scheduled_at >= ? AND scheduled_at <= ?", fromT, toT.Add(24*time.Hour)).
		Order("scheduled_at asc").Find(&tasks)
	for _, t := range tasks {
		events = append(events, map[string]interface{}{
			"type": "task", "date": t.ScheduledAt.Format("2006-01-02"),
			"title": t.Title, "taskType": t.Type, "status": t.Status, "id": t.ID,
		})
	}

	return map[string]interface{}{"success": true, "count": len(events), "events": events, "from": from, "to": to}
}

func (te *toolExecutor) rnvListScheduledTasks(args map[string]interface{}) map[string]interface{} {
	q := te.db.Preload("Client").Preload("Service").Order("scheduled_at asc")
	status := strArg(args, "status")
	if status == "" {
		status = "pending"
	}
	q = q.Where("status = ?", status)
	if taskType := strArg(args, "type"); taskType != "" {
		q = q.Where("type = ?", taskType)
	}
	if serviceID := strArg(args, "serviceId"); serviceID != "" {
		q = q.Where("service_id = ?", serviceID)
	}
	limit := intArg(args, "limit", 30)
	var tasks []models.ScheduledTask
	q.Limit(limit).Find(&tasks)
	now := time.Now()
	out := make([]map[string]interface{}, 0, len(tasks))
	overdueCount := 0
	staleCount := 0
	for _, t := range tasks {
		daysPending := int(now.Sub(t.ScheduledAt).Hours() / 24)
		overdue := t.ScheduledAt.Before(now) && t.Status == "pending"
		stale := t.Status == "pending" && daysPending > 3
		if overdue {
			overdueCount++
		}
		if stale {
			staleCount++
		}
		item := map[string]interface{}{
			"id": t.ID, "title": t.Title, "type": t.Type, "status": t.Status,
			"scheduledAt": t.ScheduledAt.Format("2006-01-02 15:04"),
			"overdue": overdue, "daysPending": daysPending, "stale": stale,
		}
		if t.Description != nil {
			item["description"] = *t.Description
		}
		if t.Client != nil {
			item["clientName"] = t.Client.Name
		}
		if t.Service != nil {
			item["serviceId"] = t.Service.ID
			item["serviceName"] = t.Service.Name
		}
		out = append(out, item)
	}
	return map[string]interface{}{
		"success": true, "count": len(out), "tasks": out,
		"summary": map[string]interface{}{
			"overdue": overdueCount, "stale": staleCount,
			"hint": "stale = pendiente hace más de 3 días; overdue = fecha programada ya pasó",
		},
	}
}

func (te *toolExecutor) rnvWorkflow(args map[string]interface{}) map[string]interface{} {
	q := te.db.Preload("Client").Preload("Service").
		Where("status = ? AND type = ?", "pending", "work").
		Order("scheduled_at asc")
	if serviceID := strArg(args, "serviceId"); serviceID != "" {
		q = q.Where("service_id = ?", serviceID)
	}
	limit := intArg(args, "limit", 50)
	var tasks []models.ScheduledTask
	q.Limit(limit).Find(&tasks)

	now := time.Now()
	byService := map[string]map[string]interface{}{}
	alerts := []string{}
	overdue := 0
	stale := 0

	for _, t := range tasks {
		days := int(now.Sub(t.ScheduledAt).Hours() / 24)
		isOverdue := t.ScheduledAt.Before(now)
		isStale := days > 3
		if isOverdue {
			overdue++
		}
		if isStale {
			stale++
		}
		item := map[string]interface{}{
			"id": t.ID, "title": t.Title, "scheduledAt": t.ScheduledAt.Format("2006-01-02 15:04"),
			"overdue": isOverdue, "daysPending": days, "stale": isStale,
		}
		if t.Description != nil {
			item["description"] = *t.Description
		}
		svcKey := "sin-app"
		svcName := "Sin app asignada"
		if t.Service != nil {
			svcKey = t.Service.ID
			svcName = t.Service.Name
		}
		if _, ok := byService[svcKey]; !ok {
			byService[svcKey] = map[string]interface{}{
				"serviceId": svcKey, "serviceName": svcName, "tasks": []map[string]interface{}{},
			}
		}
		taskList := byService[svcKey]["tasks"].([]map[string]interface{})
		byService[svcKey]["tasks"] = append(taskList, item)
		if isOverdue {
			alerts = append(alerts, fmt.Sprintf("⚠️ VENCIDA: \"%s\" en %s (%d días)", t.Title, svcName, days))
		} else if isStale {
			alerts = append(alerts, fmt.Sprintf("⏳ Estancada: \"%s\" en %s (%d días pendiente)", t.Title, svcName, days))
		}
	}

	groups := make([]map[string]interface{}, 0, len(byService))
	for _, g := range byService {
		tasks := g["tasks"].([]map[string]interface{})
		g["count"] = len(tasks)
		groups = append(groups, g)
	}

	msg := fmt.Sprintf("%d tareas de trabajo pendientes", len(tasks))
	if overdue > 0 {
		msg += fmt.Sprintf("; %d vencidas", overdue)
	}
	if stale > 0 {
		msg += fmt.Sprintf("; %d estancadas (+3 días)", stale)
	}

	return map[string]interface{}{
		"success": true,
		"message": msg,
		"total":   len(tasks),
		"summary": map[string]interface{}{"overdue": overdue, "stale": stale, "pending": len(tasks)},
		"alerts":  alerts,
		"groups":  groups,
	}
}

func (te *toolExecutor) rnvProbeURL(args map[string]interface{}) map[string]interface{} {
	raw := strArg(args, "url")
	if raw == "" {
		return map[string]interface{}{"success": false, "error": "url requerida"}
	}
	pr := serviceslayer.ProbeURLWithDB(te.db, raw)
	return map[string]interface{}{"success": true, "data": pr}
}

func (te *toolExecutor) rnvCreateService(args map[string]interface{}) map[string]interface{} {
	name := strArg(args, "name")
	svcType := strArg(args, "type")
	if svcType == "" {
		svcType = "web"
	}
	vpsID := strArg(args, "vpsId")
	vpsName := strArg(args, "vpsName")
	if vpsID == "" && vpsName != "" {
		var vps models.VPS
		if te.db.Where("name ILIKE ?", "%"+vpsName+"%").First(&vps).Error == nil {
			vpsID = vps.ID
		}
	}
	if vpsID == "" {
		return map[string]interface{}{"success": false, "error": "vpsId o vpsName requerido"}
	}
	rawURL := strArg(args, "url")
	if name == "" && rawURL != "" {
		pr := serviceslayer.ProbeURL(rawURL)
		name = pr.SuggestedName
		if svcType == "web" && pr.SuggestedType != "" {
			svcType = pr.SuggestedType
		}
	}
	if name == "" {
		return map[string]interface{}{"success": false, "error": "name o url requerido"}
	}
	svc := models.Service{
		Name: name, Type: svcType, Status: strArg(args, "status"),
		VpsID: &vpsID,
	}
	if svc.Status == "" {
		svc.Status = "running"
	}
	if rawURL != "" {
		norm := serviceslayer.NormalizeURL(rawURL)
		svc.URL = &norm
		pr := serviceslayer.ProbeURLWithDB(te.db, norm)
		if pr.SuggestedType != "" && svcType == "web" {
			svc.Type = pr.SuggestedType
		}
		if pr.Status != "" {
			svc.Status = pr.Status
		}
	}
	clientID := strArg(args, "clientId")
	if clientID == "" {
		clientName := strArg(args, "clientName")
		if clientName != "" {
			var cl models.Client
			if te.db.Where("name ILIKE ?", "%"+clientName+"%").First(&cl).Error == nil {
				clientID = cl.ID
			}
		}
	}
	if clientID != "" {
		svc.ClientID = &clientID
	}
	if mc := toFloat(args["monthlyCost"]); mc > 0 {
		svc.MonthlyCost = mc
	}
	serviceslayer.EnrichServiceIcon(&svc)
	if err := te.db.Create(&svc).Error; err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	if svc.ClientID != nil {
		serviceslayer.RecalculateClientCost(te.db, *svc.ClientID)
	}
	return map[string]interface{}{
		"success": true,
		"message": "Servicio creado: " + svc.Name,
		"service": map[string]interface{}{
			"id": svc.ID, "name": svc.Name, "type": svc.Type, "url": svc.URL,
			"faviconUrl": svc.FaviconURL, "vpsId": svc.VpsID, "clientId": svc.ClientID,
		},
	}
}

func (te *toolExecutor) rnvUpdateService(args map[string]interface{}) map[string]interface{} {
	id := strArg(args, "serviceId")
	if id == "" {
		id = strArg(args, "id")
	}
	name := strArg(args, "name")
	var svc models.Service
	q := te.db
	if id != "" {
		q = q.Where("id = ?", id)
	} else if name != "" {
		q = q.Where("name ILIKE ?", "%"+name+"%")
	} else {
		return map[string]interface{}{"success": false, "error": "serviceId o name requerido"}
	}
	if err := q.First(&svc).Error; err != nil {
		return map[string]interface{}{"success": false, "error": "servicio no encontrado"}
	}
	updates := map[string]interface{}{}
	if v := strArg(args, "url"); v != "" {
		norm := serviceslayer.NormalizeURL(v)
		updates["url"] = norm
		svc.URL = &norm
	}
	if v := strArg(args, "type"); v != "" {
		updates["type"] = v
		svc.Type = v
	}
	if v := strArg(args, "status"); v != "" {
		updates["status"] = v
	}
	if v := strArg(args, "name"); v != "" && id != "" {
		updates["name"] = v
	}
	if mc := toFloat(args["monthlyCost"]); mc > 0 {
		updates["monthly_cost"] = mc
	}
	if vpsID := strArg(args, "vpsId"); vpsID != "" {
		updates["vps_id"] = vpsID
	}
	if clientID := strArg(args, "clientId"); clientID != "" {
		updates["client_id"] = clientID
	}
	if len(updates) == 0 {
		return map[string]interface{}{"success": false, "error": "sin cambios"}
	}
	if svc.URL != nil {
		serviceslayer.EnrichServiceIcon(&svc)
		if svc.FaviconURL != nil {
			updates["favicon_url"] = *svc.FaviconURL
		}
	}
	if err := te.db.Model(&svc).Updates(updates).Error; err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	te.db.First(&svc, "id = ?", svc.ID)
	return map[string]interface{}{"success": true, "message": "Servicio actualizado", "service": simplifyServiceOne(svc)}
}

func simplifyServiceOne(s models.Service) map[string]interface{} {
	return map[string]interface{}{
		"id": s.ID, "name": s.Name, "type": s.Type, "status": s.Status,
		"url": s.URL, "faviconUrl": s.FaviconURL, "vpsId": s.VpsID, "clientId": s.ClientID,
	}
}

func (te *toolExecutor) rnvScanServices(args map[string]interface{}) map[string]interface{} {
	if te.cfg.MasterPassword == "" {
		return map[string]interface{}{"success": false, "error": "MASTER_PASSWORD no configurado para escaneo SSH"}
	}
	vpsID := strArg(args, "vpsId")
	results, err := serviceslayer.ScanAllVPS(te.db, te.cfg, vpsID)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	totalFound, totalCreated, totalUpdated := 0, 0, 0
	out := make([]map[string]interface{}, 0, len(results))
	for _, r := range results {
		totalFound += len(r.Found)
		totalCreated += r.Created
		totalUpdated += r.Updated
		item := map[string]interface{}{
			"vpsId": r.VpsID, "vpsName": r.VpsName, "ip": r.IP,
			"success": r.Success, "created": r.Created, "updated": r.Updated,
			"found": len(r.Found),
		}
		if r.Error != "" {
			item["error"] = r.Error
		}
		out = append(out, item)
	}
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Escaneo: %d encontrados, %d creados, %d actualizados", totalFound, totalCreated, totalUpdated),
		"results": out,
		"totals": map[string]interface{}{"found": totalFound, "created": totalCreated, "updated": totalUpdated},
	}
}

func (te *toolExecutor) rnvDNSLookup(args map[string]interface{}) map[string]interface{} {
	host := strArg(args, "hostname")
	if host == "" {
		host = strArg(args, "url")
	}
	if host == "" {
		return map[string]interface{}{"success": false, "error": "hostname o url requerido"}
	}
	return serviceslayer.DNSLookupWithVPS(te.db, host)
}

func (te *toolExecutor) rnvSendEmail(args map[string]interface{}) map[string]interface{} {
	to := strArg(args, "to")
	subject := strArg(args, "subject")
	body := strArg(args, "body")
	if to == "" || subject == "" || body == "" {
		return map[string]interface{}{"success": false, "error": "to, subject y body requeridos"}
	}
	htmlBody := body
	if !boolArg(args, "isHtml", false) {
		htmlBody = fmt.Sprintf("<pre>%s</pre>", body)
	}
	if err := serviceslayer.SendEmail(te.db, te.cfg, to, subject, htmlBody); err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{"success": true, "message": "Email enviado a " + to}
}

func (te *toolExecutor) rnvSendWhatsApp(args map[string]interface{}) map[string]interface{} {
	to := strArg(args, "to")
	text := strArg(args, "text")
	if text == "" {
		return map[string]interface{}{"success": false, "error": "text requerido"}
	}
	sent, err := serviceslayer.SendWhatsAppTo(te.db, te.cfg, to, text)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("WhatsApp enviado a %s", strings.Join(sent, ", ")),
		"sentTo":  sent,
	}
}

func (te *toolExecutor) rnvWhatsAppReport(args map[string]interface{}) map[string]interface{} {
	report := strArg(args, "report")
	if report == "" {
		report = strArg(args, "type")
	}
	if report == "" {
		return map[string]interface{}{"success": false, "error": "report requerido (dashboard, billing, offline, topology, workflow, overdue, vps, client, services)"}
	}
	opts := serviceslayer.ReportOptions{
		ClientID:    strArg(args, "clientId"),
		ClientName:  strArg(args, "clientName"),
		VpsID:       strArg(args, "vpsId"),
		VpsName:     strArg(args, "vpsName"),
		ServiceID:   strArg(args, "serviceId"),
		ServiceName: strArg(args, "serviceName"),
	}
	to := strArg(args, "to")
	sent, preview, err := serviceslayer.SendWhatsAppReport(te.db, te.cfg, report, to, opts)
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Reporte '%s' enviado por WhatsApp a %s", report, strings.Join(sent, ", ")),
		"report":  report,
		"sentTo":  sent,
		"preview": preview,
	}
}

func (te *toolExecutor) rnvBillingRemind(args map[string]interface{}) map[string]interface{} {
	clientID := strArg(args, "clientId")
	clientName := strArg(args, "clientName")
	channel := strings.ToLower(strArg(args, "channel"))
	if channel == "" {
		channel = "email"
	}
	now := time.Now()

	sendOne := func(cl models.Client) (string, error) {
		overdue, daysLate, amount := serviceslayer.ClientOverdueInfo(te.db, cl, now)
		if !overdue || amount <= 0 {
			return "", fmt.Errorf("cliente no está en mora")
		}
		switch channel {
		case "whatsapp", "wa":
			if err := serviceslayer.SendOverdueInvoiceWhatsApp(te.db, te.cfg, cl, amount, daysLate); err != nil {
				return "", err
			}
			return fmt.Sprintf("WhatsApp (849) → cliente %s (%s)", cl.Name, serviceslayer.FormatWhatsAppRecipient(derefStr(cl.Phone))), nil
		default:
			if cl.Email == nil || *cl.Email == "" {
				return "", fmt.Errorf("cliente sin email")
			}
			if err := serviceslayer.SendOverdueInvoiceEmail(te.db, te.cfg, cl, amount, daysLate); err != nil {
				return "", err
			}
			return "Email enviado a " + cl.Name, nil
		}
	}

	if clientID != "" {
		var cl models.Client
		if te.db.First(&cl, "id = ?", clientID).Error != nil {
			return map[string]interface{}{"success": false, "error": "cliente no encontrado"}
		}
		msg, err := sendOne(cl)
		if err != nil {
			return map[string]interface{}{"success": false, "error": err.Error()}
		}
		return map[string]interface{}{"success": true, "message": msg}
	}
	if clientName != "" {
		var cl models.Client
		if te.db.Where("name ILIKE ?", "%"+clientName+"%").First(&cl).Error != nil {
			return map[string]interface{}{"success": false, "error": "cliente no encontrado: " + clientName}
		}
		msg, err := sendOne(cl)
		if err != nil {
			return map[string]interface{}{"success": false, "error": err.Error()}
		}
		return map[string]interface{}{"success": true, "message": msg}
	}
	var clients []models.Client
	te.db.Where("is_active = true").Find(&clients)
	sent, failed := 0, 0
	for _, cl := range clients {
		overdue, daysLate, amount := serviceslayer.ClientOverdueInfo(te.db, cl, now)
		if !overdue || amount <= 0 {
			continue
		}
		if channel == "whatsapp" || channel == "wa" {
			if cl.Phone == nil || strings.TrimSpace(*cl.Phone) == "" {
				failed++
				continue
			}
			if err := serviceslayer.SendOverdueInvoiceWhatsApp(te.db, te.cfg, cl, amount, daysLate); err != nil {
				failed++
			} else {
				sent++
			}
			continue
		}
		if cl.Email == nil || *cl.Email == "" {
			continue
		}
		if err := serviceslayer.SendOverdueInvoiceEmail(te.db, te.cfg, cl, amount, daysLate); err != nil {
			failed++
		} else {
			sent++
		}
	}
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Recordatorios: %d enviados, %d fallidos", sent, failed),
		"sent": sent, "failed": failed,
	}
}

func (te *toolExecutor) rnvServiceHealth(args map[string]interface{}) map[string]interface{} {
	serviceID := strArg(args, "serviceId")
	serviceName := strArg(args, "serviceName")
	if serviceID != "" || serviceName != "" {
		if serviceID == "" {
			var svc models.Service
			if te.db.Where("name ILIKE ?", "%"+serviceName+"%").First(&svc).Error != nil {
				return map[string]interface{}{"success": false, "error": "servicio no encontrado"}
			}
			serviceID = svc.ID
		}
		res, err := serviceslayer.ProbeServiceNow(te.db, te.cfg, serviceID)
		if err != nil {
			return map[string]interface{}{"success": false, "error": err.Error()}
		}
		return map[string]interface{}{"success": true, "data": res}
	}
	results := serviceslayer.RunServiceHealthChecks(te.db, te.cfg)
	offline := make([]map[string]interface{}, 0)
	changed := 0
	for _, r := range results {
		if r.Changed {
			changed++
		}
		if !r.Online && r.Method != "skip" {
			offline = append(offline, map[string]interface{}{
				"serviceId": r.ServiceID, "name": r.ServiceName,
				"status": r.NewStatus, "url": r.URL, "vps": r.VPSName,
			})
		}
	}
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Revisados %d servicios — %d offline, %d cambios", len(results), len(offline), changed),
		"offline": offline,
		"offlineCount": len(offline),
		"changed": changed,
	}
}

func (te *toolExecutor) rnvListOfflineServices(args map[string]interface{}) map[string]interface{} {
	list, count := serviceslayer.ListOfflineServices(te.db)
	return map[string]interface{}{
		"success": true,
		"count": count,
		"services": list,
		"message": fmt.Sprintf("%d servicios offline", count),
	}
}

func (te *toolExecutor) rnvCompleteTask(args map[string]interface{}) map[string]interface{} {
	id := strArg(args, "taskId")
	if id == "" {
		id = strArg(args, "id")
	}
	if id == "" {
		title := strArg(args, "title")
		if title == "" {
			return map[string]interface{}{"success": false, "error": "taskId o title requerido"}
		}
		var task models.ScheduledTask
		if te.db.Where("title ILIKE ? AND status = ?", "%"+title+"%", "pending").Order("scheduled_at desc").First(&task).Error != nil {
			return map[string]interface{}{"success": false, "error": "tarea no encontrada"}
		}
		id = task.ID
	}
	var task models.ScheduledTask
	if err := te.db.First(&task, "id = ?", id).Error; err != nil {
		return map[string]interface{}{"success": false, "error": "tarea no encontrada"}
	}
	if err := te.db.Model(&task).Update("status", "done").Error; err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}
	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Tarea completada: %s", task.Title),
		"task":    map[string]interface{}{"id": task.ID, "title": task.Title, "status": "done"},
	}
}

func (te *toolExecutor) rnvTopology(args map[string]interface{}) map[string]interface{} {
	var clients []models.Client
	var vpsList []models.VPS
	var services []models.Service
	te.db.Where("is_active = true").Find(&clients)
	te.db.Preload("Client").Find(&vpsList)
	te.db.Preload("Client").Preload("VPS").Find(&services)

	clusters := make([]map[string]interface{}, 0, len(vpsList))
	for _, v := range vpsList {
		var svcs []models.Service
		for _, s := range services {
			if s.VpsID != nil && *s.VpsID == v.ID {
				svcs = append(svcs, s)
			}
		}
		clientName := ""
		if v.Client != nil {
			clientName = v.Client.Name
		}
		svcBrief := make([]map[string]interface{}, 0, len(svcs))
		for _, s := range svcs {
			cn := clientName
			if s.Client != nil {
				cn = s.Client.Name
			}
			svcBrief = append(svcBrief, map[string]interface{}{
				"name": s.Name, "type": s.Type, "status": s.Status,
				"monthlyCost": s.MonthlyCost, "client": cn,
			})
		}
		clusters = append(clusters, map[string]interface{}{
			"vps": v.Name, "ip": v.IPAddress, "client": clientName,
			"status": v.Status, "services": len(svcs), "serviceList": svcBrief,
		})
	}

	var revenue float64
	for _, c := range clients {
		revenue += serviceslayer.ClientChargeAmount(c)
	}

	return map[string]interface{}{
		"success": true,
		"totals": map[string]interface{}{
			"clients": len(clients), "vps": len(vpsList), "services": len(services),
			"monthlyRevenue": revenue,
		},
		"clusters": clusters,
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────────

func simplifyClients(clients []models.Client) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(clients))
	for _, c := range clients {
		out = append(out, simplifyClient(c))
	}
	return out
}

func simplifyClient(c models.Client) map[string]interface{} {
	return map[string]interface{}{
		"id": c.ID, "name": c.Name, "email": c.Email,
		"billingCycle": serviceslayer.ClientBillingCycle(c),
		"monthlyFee": c.MonthlyFee, "annualFee": c.AnnualFee,
		"totalMonthlyCost": c.TotalMonthlyCost,
		"paymentDay": c.PaymentDay, "paymentMonth": c.PaymentMonth,
		"isActive": c.IsActive, "companyName": c.CompanyName,
	}
}

func simplifyVPSList(list []models.VPS) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(list))
	for _, v := range list {
		out = append(out, map[string]interface{}{
			"id": v.ID, "name": v.Name, "ipAddress": v.IPAddress,
			"status": v.Status, "monthlyCost": v.MonthlyCost, "provider": v.Provider,
			"clientId": v.ClientID,
		})
	}
	return out
}

func simplifyServices(list []models.Service) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(list))
	for _, s := range list {
		out = append(out, map[string]interface{}{
			"id": s.ID, "name": s.Name, "type": s.Type, "status": s.Status,
			"monthlyCost": s.MonthlyCost, "vpsId": s.VpsID, "clientId": s.ClientID,
			"url": s.URL, "faviconUrl": s.FaviconURL,
		})
	}
	return out
}

func simplifyPayments(list []models.Payment) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(list))
	for _, p := range list {
		item := map[string]interface{}{
			"id": p.ID, "amount": p.Amount, "currency": p.Currency,
			"status": p.Status, "clientId": p.ClientID,
			"date": p.Date.Format("2006-01-02"), "notes": p.Notes,
		}
		if p.Client != nil {
			item["client"] = p.Client.Name
		}
		out = append(out, item)
	}
	return out
}

func simplifyProducts(products []map[string]interface{}) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(products))
	for _, p := range products {
		out = append(out, simplifyProduct(p))
	}
	return out
}

func simplifyProduct(p map[string]interface{}) map[string]interface{} {
	if p == nil {
		return nil
	}
	return map[string]interface{}{
		"id":               p["id"],
		"name":             p["name"],
		"sku":              p["default_code"],
		"list_price":       p["list_price"],
		"cost":             p["standard_price"],
		"qty_available":    p["qty_available"],
		"description_sale": p["description_sale"],
		"active":           p["active"],
		"type":             p["type"],
		"category":         relName(p["categ_id"]),
	}
}

func relName(v interface{}) string {
	arr, ok := v.([]interface{})
	if !ok || len(arr) < 2 {
		return ""
	}
	if s, ok := arr[1].(string); ok {
		return s
	}
	return fmt.Sprintf("%v", arr[1])
}

func ptrStr(c *models.Client) string {
	if c == nil {
		return ""
	}
	return c.Name
}

func strArg(args map[string]interface{}, key string) string {
	if args == nil {
		return ""
	}
	v, ok := args[key]
	if !ok || v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprintf("%v", t)
	}
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func intArg(args map[string]interface{}, key string, def int) int {
	if args == nil {
		return def
	}
	v, ok := args[key]
	if !ok || v == nil {
		return def
	}
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case json.Number:
		i, _ := t.Int64()
		return int(i)
	default:
		return def
	}
}

func boolArg(args map[string]interface{}, key string, def bool) bool {
	if args == nil {
		return def
	}
	v, ok := args[key]
	if !ok || v == nil {
		return def
	}
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return t == "true" || t == "1"
	default:
		return def
	}
}

func toFloat(v interface{}) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case int:
		return float64(t)
	case json.Number:
		f, _ := t.Float64()
		return f
	default:
		return 0
	}
}
