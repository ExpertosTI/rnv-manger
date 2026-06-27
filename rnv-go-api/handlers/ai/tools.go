package ai

import (
	"encoding/json"
	"fmt"

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
	case "rnv_list_clients":
		result.Result = te.rnvListClients(args)
	case "rnv_list_vps":
		result.Result = te.rnvListVPS()
	case "rnv_dashboard_stats":
		result.Result = te.rnvDashboardStats()
	default:
		result.Result = map[string]interface{}{"success": false, "error": "función desconocida: " + name}
	}
	return result
}

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

func (te *toolExecutor) rnvListClients(args map[string]interface{}) map[string]interface{} {
	limit := intArg(args, "limit", 20)
	var clients []models.Client
	te.db.Where("is_active = true").Order("name asc").Limit(limit).Find(&clients)
	out := make([]map[string]interface{}, 0, len(clients))
	for _, c := range clients {
		out = append(out, map[string]interface{}{
			"id": c.ID, "name": c.Name, "email": c.Email,
			"monthlyFee": c.MonthlyFee, "totalMonthlyCost": c.TotalMonthlyCost,
			"odooPartnerId": c.OdooPartnerID,
		})
	}
	return map[string]interface{}{"success": true, "count": len(out), "clients": out}
}

func (te *toolExecutor) rnvListVPS() map[string]interface{} {
	var vpsList []models.VPS
	te.db.Order("name asc").Find(&vpsList)
	out := make([]map[string]interface{}, 0, len(vpsList))
	for _, v := range vpsList {
		out = append(out, map[string]interface{}{
			"id": v.ID, "name": v.Name, "ipAddress": v.IPAddress,
			"status": v.Status, "monthlyCost": v.MonthlyCost, "provider": v.Provider,
		})
	}
	return map[string]interface{}{"success": true, "count": len(out), "vps": out}
}

func (te *toolExecutor) rnvDashboardStats() map[string]interface{} {
	var clientCount, vpsCount, serviceCount int64
	var totalRevenue, totalExpenses float64

	te.db.Model(&models.Client{}).Where("is_active = true").Count(&clientCount)
	te.db.Model(&models.VPS{}).Count(&vpsCount)
	te.db.Model(&models.Service{}).Count(&serviceCount)
	te.db.Model(&models.VPS{}).Select("COALESCE(SUM(monthly_cost),0)").Scan(&totalExpenses)

	var clients []models.Client
	te.db.Where("is_active = true").Find(&clients)
	for _, c := range clients {
		totalRevenue += c.MonthlyFee + c.TotalMonthlyCost
	}

	return map[string]interface{}{
		"success": true,
		"stats": map[string]interface{}{
			"clients":        clientCount,
			"vps":            vpsCount,
			"services":       serviceCount,
			"monthlyRevenue": totalRevenue,
			"monthlyExpense": totalExpenses,
			"netProfit":      totalRevenue - totalExpenses,
		},
	}
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
