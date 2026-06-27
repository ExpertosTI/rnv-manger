package serviceslayer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

type OdooConfig struct {
	URL      string
	DB       string
	Username string
	APIKey   string
}

type OdooClient struct {
	cfg OdooConfig
	uid int
	mu  sync.Mutex
}

type jsonRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params"`
	ID      int         `json:"id"`
}

type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *jsonRPCError   `json:"error"`
}

// ResolveOdooConfig loads Odoo credentials from DB settings, falling back to env.
func ResolveOdooConfig(db *gorm.DB, cfg *config.Config) OdooConfig {
	oc := OdooConfig{
		URL:      cfg.OdooURL,
		DB:       cfg.OdooDB,
		Username: cfg.OdooUsername,
		APIKey:   cfg.OdooAPIKey,
	}
	if db == nil {
		return oc
	}

	var settings []models.AppSettings
	db.Where("key IN ?", []string{
		"odoo_url", "odoo_db", "odoo_user", "odoo_key",
	}).Find(&settings)

	for _, s := range settings {
		if s.Value == "" {
			continue
		}
		switch s.Key {
		case "odoo_url":
			oc.URL = s.Value
		case "odoo_db":
			oc.DB = s.Value
		case "odoo_user":
			oc.Username = s.Value
		case "odoo_key":
			oc.APIKey = s.Value
		}
	}
	return oc
}

func NewOdooClient(db *gorm.DB, cfg *config.Config) (*OdooClient, error) {
	oc := ResolveOdooConfig(db, cfg)
	if oc.URL == "" || oc.DB == "" || oc.Username == "" || oc.APIKey == "" {
		return nil, fmt.Errorf("Odoo no configurado: define ODOO_URL, ODOO_DB, ODOO_USERNAME y ODOO_API_KEY (o en Ajustes)")
	}
	client := &OdooClient{cfg: oc}
	if err := client.ensureAuth(); err != nil {
		return nil, err
	}
	return client, nil
}

func (o *OdooClient) Configured() bool {
	return o.cfg.URL != "" && o.cfg.DB != "" && o.cfg.Username != "" && o.cfg.APIKey != ""
}

func (o *OdooClient) Info() map[string]interface{} {
	return map[string]interface{}{
		"url":      o.cfg.URL,
		"database": o.cfg.DB,
		"username": o.cfg.Username,
		"uid":      o.uid,
	}
}

func (o *OdooClient) ensureAuth() error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.uid > 0 {
		return nil
	}
	var uid int
	if err := o.call("common", "authenticate", []interface{}{
		o.cfg.DB, o.cfg.Username, o.cfg.APIKey, map[string]interface{}{},
	}, &uid); err != nil {
		return fmt.Errorf("autenticación Odoo falló: %w", err)
	}
	if uid <= 0 {
		return fmt.Errorf("credenciales Odoo inválidas")
	}
	o.uid = uid
	return nil
}

func (o *OdooClient) call(service, method string, args []interface{}, result interface{}) error {
	reqBody := jsonRPCRequest{
		JSONRPC: "2.0",
		Method:  "call",
		Params: map[string]interface{}{
			"service": service,
			"method":  method,
			"args":    args,
		},
		ID: 1,
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	url := strings.TrimRight(o.cfg.URL, "/") + "/jsonrpc"
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Post(url, "application/json", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var rpc jsonRPCResponse
	if err := json.Unmarshal(body, &rpc); err != nil {
		return fmt.Errorf("respuesta Odoo inválida: %w", err)
	}
	if rpc.Error != nil {
		return fmt.Errorf("Odoo error %d: %s", rpc.Error.Code, rpc.Error.Message)
	}
	if result != nil && len(rpc.Result) > 0 && string(rpc.Result) != "false" {
		if err := json.Unmarshal(rpc.Result, result); err != nil {
			return fmt.Errorf("parse result: %w", err)
		}
	}
	return nil
}

func (o *OdooClient) Execute(model, method string, args []interface{}, kwargs map[string]interface{}) (json.RawMessage, error) {
	if err := o.ensureAuth(); err != nil {
		return nil, err
	}
	if kwargs == nil {
		kwargs = map[string]interface{}{}
	}

	var result json.RawMessage
	err := o.call("object", "execute_kw", []interface{}{
		o.cfg.DB, o.uid, o.cfg.APIKey, model, method, args, kwargs,
	}, &result)
	return result, err
}

func (o *OdooClient) SearchRead(model string, domain []interface{}, fields []string, limit int) ([]map[string]interface{}, error) {
	kwargs := map[string]interface{}{"fields": fields}
	if limit > 0 {
		kwargs["limit"] = limit
	}
	raw, err := o.Execute(model, "search_read", []interface{}{domain}, kwargs)
	if err != nil {
		return nil, err
	}
	var records []map[string]interface{}
	if err := json.Unmarshal(raw, &records); err != nil {
		return nil, err
	}
	return records, nil
}

func (o *OdooClient) Read(model string, ids []int, fields []string) ([]map[string]interface{}, error) {
	raw, err := o.Execute(model, "read", []interface{}{ids}, map[string]interface{}{"fields": fields})
	if err != nil {
		return nil, err
	}
	var records []map[string]interface{}
	if err := json.Unmarshal(raw, &records); err != nil {
		return nil, err
	}
	return records, nil
}

func (o *OdooClient) Create(model string, values map[string]interface{}) (int, error) {
	raw, err := o.Execute(model, "create", []interface{}{values}, map[string]interface{}{})
	if err != nil {
		return 0, err
	}
	var id int
	if err := json.Unmarshal(raw, &id); err != nil {
		return 0, err
	}
	return id, nil
}

func (o *OdooClient) Write(model string, ids []int, values map[string]interface{}) (bool, error) {
	raw, err := o.Execute(model, "write", []interface{}{ids, values}, map[string]interface{}{})
	if err != nil {
		return false, err
	}
	var ok bool
	if err := json.Unmarshal(raw, &ok); err != nil {
		return false, err
	}
	return ok, nil
}

func (o *OdooClient) TestConnection() (map[string]interface{}, error) {
	if err := o.ensureAuth(); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"connected": true,
		"uid":       o.uid,
		"url":       o.cfg.URL,
		"database":  o.cfg.DB,
	}, nil
}

func (o *OdooClient) SearchProducts(query string, limit int) ([]map[string]interface{}, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	domain := []interface{}{[]interface{}{"active", "=", true}}
	if query != "" {
		domain = append(domain, "|", "|",
			[]interface{}{"name", "ilike", query},
			[]interface{}{"default_code", "ilike", query},
			[]interface{}{"barcode", "ilike", query},
		)
	}
	return o.SearchRead("product.template", domain, []string{
		"id", "name", "default_code", "list_price", "standard_price",
		"description_sale", "qty_available", "categ_id", "active", "type",
	}, limit)
}

func (o *OdooClient) GetProduct(id int) (map[string]interface{}, error) {
	records, err := o.Read("product.template", []int{id}, []string{
		"id", "name", "default_code", "list_price", "standard_price",
		"description_sale", "description", "qty_available", "categ_id", "active", "type", "barcode",
	})
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("producto %d no encontrado", id)
	}
	return records[0], nil
}

func (o *OdooClient) CreateProduct(values map[string]interface{}) (int, error) {
	if _, ok := values["name"]; !ok {
		return 0, fmt.Errorf("name es requerido")
	}
	if _, ok := values["list_price"]; !ok {
		values["list_price"] = 0.0
	}
	if _, ok := values["type"]; !ok {
		values["type"] = "consu"
	}
	return o.Create("product.template", values)
}

func (o *OdooClient) UpdateProduct(id int, values map[string]interface{}) (bool, error) {
	if len(values) == 0 {
		return false, fmt.Errorf("no hay campos para actualizar")
	}
	allowed := map[string]bool{
		"name": true, "list_price": true, "standard_price": true,
		"default_code": true, "description_sale": true, "description": true,
		"active": true, "barcode": true,
	}
	filtered := map[string]interface{}{}
	for k, v := range values {
		if allowed[k] {
			filtered[k] = v
		}
	}
	if len(filtered) == 0 {
		return false, fmt.Errorf("ningún campo válido para actualizar")
	}
	return o.Write("product.template", []int{id}, filtered)
}

func (o *OdooClient) SearchPartners(query string, limit int) ([]map[string]interface{}, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	domain := []interface{}{[]interface{}{"active", "=", true}}
	if query != "" {
		domain = append(domain, "|",
			[]interface{}{"name", "ilike", query},
			[]interface{}{"email", "ilike", query},
		)
	}
	return o.SearchRead("res.partner", domain, []string{
		"id", "name", "email", "phone", "city", "country_id", "customer_rank", "supplier_rank",
	}, limit)
}

func (o *OdooClient) ListProductCategories(limit int) ([]map[string]interface{}, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	return o.SearchRead("product.category", []interface{}{}, []string{"id", "name", "complete_name"}, limit)
}
