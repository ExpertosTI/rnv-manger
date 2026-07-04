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
			"monthlyFee": client.MonthlyFee, "totalMonthlyCost": client.TotalMonthlyCost,
			"paymentDay": client.PaymentDay, "isActive": client.IsActive,
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
		totalRevenue += c.MonthlyFee + c.TotalMonthlyCost
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
		totalRevenue += c.MonthlyFee + c.TotalMonthlyCost
	}

	now := time.Now()
	day := now.Day()
	var upcoming []models.Client
	te.db.Where("is_active = true AND payment_day BETWEEN ? AND ?", day, day+5).
		Order("payment_day asc").Find(&upcoming)

	upcomingOut := make([]map[string]interface{}, 0, len(upcoming))
	for _, c := range upcoming {
		upcomingOut = append(upcomingOut, map[string]interface{}{
			"id": c.ID, "name": c.Name, "paymentDay": c.PaymentDay,
			"amount": c.MonthlyFee + c.TotalMonthlyCost,
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
	day := now.Day()

	var clients []models.Client
	te.db.Where("is_active = true AND payment_day < ?", day).Order("payment_day asc").Find(&clients)

	// Clients whose payment day already passed this month and have no payment this month
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	overdue := make([]map[string]interface{}, 0)

	for _, c := range clients {
		var payCount int64
		te.db.Model(&models.Payment{}).
			Where("client_id = ? AND date >= ? AND status = ?", c.ID, startOfMonth, "completed").
			Count(&payCount)
		if payCount == 0 {
			overdue = append(overdue, map[string]interface{}{
				"id": c.ID, "name": c.Name, "paymentDay": c.PaymentDay,
				"amount": c.MonthlyFee + c.TotalMonthlyCost,
				"daysOverdue": day - c.PaymentDay,
			})
		}
	}

	return map[string]interface{}{"success": true, "count": len(overdue), "clients": overdue}
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
		"monthlyFee": c.MonthlyFee, "totalMonthlyCost": c.TotalMonthlyCost,
		"paymentDay": c.PaymentDay, "isActive": c.IsActive,
		"companyName": c.CompanyName,
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
			"url": s.URL,
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
