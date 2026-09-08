package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta"

type geminiClient struct {
	apiKey string
	model  string
	http   *http.Client
}

type geminiPart struct {
	Text             string            `json:"text,omitempty"`
	FunctionCall     *functionCall     `json:"functionCall,omitempty"`
	FunctionResponse *functionResponse `json:"functionResponse,omitempty"`
}

type functionCall struct {
	Name string                 `json:"name"`
	Args map[string]interface{} `json:"args"`
}

type functionResponse struct {
	Name     string      `json:"name"`
	Response interface{} `json:"response"`
}

type geminiContent struct {
	Role  string       `json:"role"`
	Parts []geminiPart `json:"parts"`
}

type geminiTool struct {
	FunctionDeclarations []functionDeclaration `json:"functionDeclarations"`
}

type functionDeclaration struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

type generationConfig struct {
	Temperature     float64 `json:"temperature,omitempty"`
	TopP            float64 `json:"topP,omitempty"`
	TopK            int     `json:"topK,omitempty"`
	MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
}

type geminiRequest struct {
	SystemInstruction *geminiContent    `json:"systemInstruction,omitempty"`
	Contents          []geminiContent   `json:"contents"`
	Tools             []geminiTool      `json:"tools,omitempty"`
	ToolConfig        *toolConfig       `json:"toolConfig,omitempty"`
	GenerationConfig  *generationConfig `json:"generationConfig,omitempty"`
}

type toolConfig struct {
	FunctionCallingConfig functionCallingConfig `json:"functionCallingConfig"`
}

type functionCallingConfig struct {
	Mode string `json:"mode"`
}

type geminiResponse struct {
	Candidates []struct {
		Content      geminiContent `json:"content"`
		FinishReason string        `json:"finishReason"`
	} `json:"candidates"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error"`
}

func newGeminiClient(apiKey, model string) *geminiClient {
	if model == "" || strings.Contains(model, "2.0") {
		model = "gemini-2.5-flash"
	}
	return &geminiClient{
		apiKey: apiKey,
		model:  model,
		http:   &http.Client{Timeout: 90 * time.Second},
	}
}

func (g *geminiClient) generate(req geminiRequest) (*geminiResponse, error) {
	primary := g.model
	if primary == "" || strings.Contains(primary, "2.0") {
		primary = "gemini-2.5-flash"
	}

	models := []string{primary}
	for _, fb := range []string{"gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro", "gemini-1.5-pro"} {
		found := false
		for _, m := range models {
			if m == fb {
				found = true
				break
			}
		}
		if !found {
			models = append(models, fb)
		}
	}
	var lastErr error
	for _, model := range models {
		client := *g
		client.model = model
		resp, err := client.generateOnce(req)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		if isRetryableGeminiErr(err) {
			continue
		}
		errStr := strings.ToLower(err.Error())
		if strings.Contains(errStr, "model") || strings.Contains(errStr, "not found") || strings.Contains(errStr, "available") {
			continue
		}
		return nil, err
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("Gemini no disponible")
}

func (g *geminiClient) generateOnce(req geminiRequest) (*geminiResponse, error) {
	if req.GenerationConfig == nil {
		req.GenerationConfig = &generationConfig{
			Temperature:     0.3,
			TopP:            0.9,
			MaxOutputTokens: 1536,
		}
	}

	url := fmt.Sprintf("%s/models/%s:generateContent", geminiBaseURL, g.model)
	raw, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt*800) * time.Millisecond)
		}

		httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
		if err != nil {
			return nil, err
		}
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("x-goog-api-key", g.apiKey)

		resp, err := g.http.Do(httpReq)
		if err != nil {
			lastErr = err
			continue
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var result geminiResponse
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("respuesta Gemini inválida: %w", err)
		}

		if result.Error != nil {
			msg := result.Error.Message
			if resp.StatusCode == 403 {
				msg = "GEMINI_API_KEY inválida o sin permisos"
			}
			if resp.StatusCode == 429 || resp.StatusCode == 503 || strings.Contains(strings.ToLower(msg), "high demand") {
				lastErr = fmt.Errorf("%s", msg)
				continue
			}
			return nil, fmt.Errorf("%s", msg)
		}
		if resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("Gemini HTTP %d", resp.StatusCode)
			continue
		}
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("Gemini HTTP %d: %s", resp.StatusCode, string(body))
		}
		if len(result.Candidates) == 0 {
			return nil, fmt.Errorf("Gemini no devolvió candidatos")
		}
		return &result, nil
	}
	return nil, lastErr
}

func extractText(content geminiContent) string {
	var parts []string
	for _, p := range content.Parts {
		if p.Text != "" {
			parts = append(parts, p.Text)
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func extractFunctionCalls(content geminiContent) []functionCall {
	var calls []functionCall
	for _, p := range content.Parts {
		if p.FunctionCall != nil {
			calls = append(calls, *p.FunctionCall)
		}
	}
	return calls
}

func emptyParams() map[string]interface{} {
	return map[string]interface{}{
		"type":       "object",
		"properties": map[string]interface{}{},
	}
}

func objectParams(properties map[string]interface{}, required []string) map[string]interface{} {
	return map[string]interface{}{
		"type":       "object",
		"properties": properties,
		"required":   required,
	}
}

func toolDeclarations() []functionDeclaration {
	return []functionDeclaration{
		// ── Odoo ──────────────────────────────────────────────────────────
		{
			Name:        "odoo_test_connection",
			Description: "Verifica la conexión con Odoo ERP y devuelve URL, base de datos y UID.",
			Parameters:  emptyParams(),
		},
		{
			Name:        "odoo_search_products",
			Description: "Busca productos en Odoo por nombre, SKU o código de barras.",
			Parameters: objectParams(map[string]interface{}{
				"query": map[string]interface{}{"type": "string", "description": "Texto a buscar. Vacío lista productos activos."},
				"limit": map[string]interface{}{"type": "integer", "description": "Máximo de resultados (default 20, max 50)"},
			}, []string{}),
		},
		{
			Name:        "odoo_get_product",
			Description: "Obtiene el detalle completo de un producto Odoo por su ID.",
			Parameters: objectParams(map[string]interface{}{
				"id": map[string]interface{}{"type": "integer", "description": "ID del producto (product.template)"},
			}, []string{"id"}),
		},
		{
			Name:        "odoo_create_product",
			Description: "Crea un nuevo producto en Odoo.",
			Parameters: objectParams(map[string]interface{}{
				"name":             map[string]interface{}{"type": "string", "description": "Nombre del producto"},
				"list_price":       map[string]interface{}{"type": "number", "description": "Precio de venta"},
				"default_code":     map[string]interface{}{"type": "string", "description": "Referencia interna / SKU"},
				"description_sale": map[string]interface{}{"type": "string", "description": "Descripción para ventas"},
				"standard_price":   map[string]interface{}{"type": "number", "description": "Coste estándar"},
			}, []string{"name"}),
		},
		{
			Name:        "odoo_update_product",
			Description: "Actualiza campos de un producto existente en Odoo.",
			Parameters: objectParams(map[string]interface{}{
				"id":               map[string]interface{}{"type": "integer", "description": "ID del producto"},
				"name":             map[string]interface{}{"type": "string"},
				"list_price":       map[string]interface{}{"type": "number"},
				"default_code":     map[string]interface{}{"type": "string"},
				"description_sale": map[string]interface{}{"type": "string"},
				"standard_price":   map[string]interface{}{"type": "number"},
				"active":           map[string]interface{}{"type": "boolean"},
			}, []string{"id"}),
		},
		{
			Name:        "odoo_search_partners",
			Description: "Busca contactos/clientes/proveedores en Odoo.",
			Parameters: objectParams(map[string]interface{}{
				"query": map[string]interface{}{"type": "string", "description": "Nombre o email"},
				"limit": map[string]interface{}{"type": "integer"},
			}, []string{}),
		},
		{
			Name:        "odoo_list_categories",
			Description: "Lista categorías de productos en Odoo.",
			Parameters: objectParams(map[string]interface{}{
				"limit": map[string]interface{}{"type": "integer"},
			}, []string{}),
		},

		// ── RNV Core ──────────────────────────────────────────────────────
		{
			Name:        "rnv_search",
			Description: "Búsqueda global en clientes, VPS y servicios por nombre, email o IP.",
			Parameters: objectParams(map[string]interface{}{
				"query": map[string]interface{}{"type": "string", "description": "Texto a buscar"},
				"limit": map[string]interface{}{"type": "integer", "description": "Máximo por categoría (default 10)"},
			}, []string{"query"}),
		},
		{
			Name:        "rnv_dashboard_stats",
			Description: "Estadísticas del panel: clientes, VPS, servicios, ingresos, gastos y beneficio neto.",
			Parameters:  emptyParams(),
		},
		{
			Name:        "rnv_list_clients",
			Description: "Lista clientes de RNV Manager. Puede filtrar por activos/inactivos.",
			Parameters: objectParams(map[string]interface{}{
				"query":  map[string]interface{}{"type": "string", "description": "Filtrar por nombre o email"},
				"active": map[string]interface{}{"type": "boolean", "description": "Solo activos (default true)"},
				"limit":  map[string]interface{}{"type": "integer"},
			}, []string{}),
		},
		{
			Name:        "rnv_get_client",
			Description: "Detalle de un cliente con VPS, servicios y pagos recientes.",
			Parameters: objectParams(map[string]interface{}{
				"id":   map[string]interface{}{"type": "string", "description": "ID del cliente"},
				"name": map[string]interface{}{"type": "string", "description": "Nombre parcial si no tienes ID"},
			}, []string{}),
		},
		{
			Name:        "rnv_create_client",
			Description: "Crea un nuevo cliente en RNV Manager con etapa y splits de colaborador/empresa.",
			Parameters: objectParams(map[string]interface{}{
				"name":                          map[string]interface{}{"type": "string"},
				"email":                         map[string]interface{}{"type": "string"},
				"phone":                         map[string]interface{}{"type": "string"},
				"companyName":                   map[string]interface{}{"type": "string"},
				"monthlyFee":                    map[string]interface{}{"type": "number", "description": "Cuota mensual (ciclo monthly)"},
				"annualFee":                     map[string]interface{}{"type": "number", "description": "Cuota anual (ciclo annual)"},
				"billingCycle":                  map[string]interface{}{"type": "string", "description": "monthly | annual"},
				"paymentDay":                    map[string]interface{}{"type": "integer", "description": "Día de pago (1-28)"},
				"paymentMonth":                  map[string]interface{}{"type": "integer", "description": "Mes de pago anual (1-12)"},
				"notes":                         map[string]interface{}{"type": "string"},
				"affiliateId":                   map[string]interface{}{"type": "string", "description": "ID o nombre del colaborador asignado"},
				"stage":                         map[string]interface{}{"type": "string", "description": "levantamiento | implementacion | revision | entregado"},
				"assessmentNotes":               map[string]interface{}{"type": "string", "description": "Notas del levantamiento inicial"},
				"implementationFee":             map[string]interface{}{"type": "number", "description": "Costo total de implementación"},
				"implementationFeeCollaborator": map[string]interface{}{"type": "number", "description": "Partida de implementación para el colaborador"},
				"implementationFeeCompany":      map[string]interface{}{"type": "number", "description": "Partida de implementación para la empresa"},
				"monthlyFeeCollaborator":        map[string]interface{}{"type": "number", "description": "Partida mensual para el colaborador"},
				"monthlyFeeCompany":             map[string]interface{}{"type": "number", "description": "Partida mensual para la empresa"},
			}, []string{"name"}),
		},
		{
			Name:        "rnv_update_client",
			Description: "Actualiza datos, etapas, cuotas o splits de un cliente existente.",
			Parameters: objectParams(map[string]interface{}{
				"id":                            map[string]interface{}{"type": "string", "description": "ID del cliente"},
				"clientName":                    map[string]interface{}{"type": "string", "description": "Nombre del cliente si no tienes el ID"},
				"name":                          map[string]interface{}{"type": "string"},
				"email":                         map[string]interface{}{"type": "string"},
				"phone":                         map[string]interface{}{"type": "string"},
				"companyName":                   map[string]interface{}{"type": "string"},
				"monthlyFee":                    map[string]interface{}{"type": "number"},
				"annualFee":                     map[string]interface{}{"type": "number"},
				"billingCycle":                  map[string]interface{}{"type": "string", "description": "monthly | annual"},
				"paymentDay":                    map[string]interface{}{"type": "integer"},
				"paymentMonth":                  map[string]interface{}{"type": "integer"},
				"isActive":                      map[string]interface{}{"type": "boolean"},
				"notes":                         map[string]interface{}{"type": "string"},
				"affiliateId":                   map[string]interface{}{"type": "string", "description": "ID o nombre del colaborador asignado"},
				"stage":                         map[string]interface{}{"type": "string", "description": "levantamiento | implementacion | revision | entregado"},
				"assessmentNotes":               map[string]interface{}{"type": "string", "description": "Notas del levantamiento inicial"},
				"implementationFee":             map[string]interface{}{"type": "number", "description": "Costo total de implementación"},
				"implementationFeeCollaborator": map[string]interface{}{"type": "number", "description": "Partida de implementación para el colaborador"},
				"implementationFeeCompany":      map[string]interface{}{"type": "number", "description": "Partida de implementación para la empresa"},
				"monthlyFeeCollaborator":        map[string]interface{}{"type": "number", "description": "Partida mensual para el colaborador"},
				"monthlyFeeCompany":             map[string]interface{}{"type": "number", "description": "Partida mensual para la empresa"},
			}, []string{}),
		},
		{
			Name:        "rnv_list_vps",
			Description: "Lista servidores VPS. Puede filtrar por estado o cliente.",
			Parameters: objectParams(map[string]interface{}{
				"status":   map[string]interface{}{"type": "string", "description": "running, stopped, unknown"},
				"clientId": map[string]interface{}{"type": "string"},
				"query":    map[string]interface{}{"type": "string", "description": "Nombre o IP"},
			}, []string{}),
		},
		{
			Name:        "rnv_get_vps",
			Description: "Detalle de un VPS con servicios asociados.",
			Parameters: objectParams(map[string]interface{}{
				"id":   map[string]interface{}{"type": "string"},
				"name": map[string]interface{}{"type": "string", "description": "Nombre o IP parcial"},
			}, []string{}),
		},
		{
			Name:        "rnv_list_services",
			Description: "Lista servicios desplegados. Puede filtrar por VPS o cliente.",
			Parameters: objectParams(map[string]interface{}{
				"vpsId":    map[string]interface{}{"type": "string"},
				"clientId": map[string]interface{}{"type": "string"},
				"query":    map[string]interface{}{"type": "string"},
				"limit":    map[string]interface{}{"type": "integer"},
			}, []string{}),
		},
		{
			Name:        "rnv_get_service",
			Description: "Detalle de un servicio por ID o nombre.",
			Parameters: objectParams(map[string]interface{}{
				"id":   map[string]interface{}{"type": "string"},
				"name": map[string]interface{}{"type": "string"},
			}, []string{}),
		},
		{
			Name:        "rnv_assign_service",
			Description: "Asigna un servicio a un cliente y opcionalmente actualiza el monto mensual.",
			Parameters: objectParams(map[string]interface{}{
				"serviceId":   map[string]interface{}{"type": "string"},
				"clientId":    map[string]interface{}{"type": "string"},
				"clientName":  map[string]interface{}{"type": "string", "description": "Alternativa a clientId"},
				"monthlyCost": map[string]interface{}{"type": "number"},
			}, []string{"serviceId"}),
		},
		{
			Name:        "rnv_billing_summary",
			Description: "Resumen financiero: ingresos, gastos, beneficio y pagos próximos.",
			Parameters:  emptyParams(),
		},
		{
			Name:        "rnv_list_payments",
			Description: "Lista pagos recientes, opcionalmente de un cliente.",
			Parameters: objectParams(map[string]interface{}{
				"clientId": map[string]interface{}{"type": "string"},
				"limit":    map[string]interface{}{"type": "integer", "description": "Default 20"},
			}, []string{}),
		},
		{
			Name:        "rnv_create_payment",
			Description: "Registra un pago de un cliente. Requiere confirmación previa del usuario.",
			Parameters: objectParams(map[string]interface{}{
				"clientId":   map[string]interface{}{"type": "string"},
				"clientName": map[string]interface{}{"type": "string", "description": "Alternativa a clientId"},
				"amount":     map[string]interface{}{"type": "number"},
				"currency":   map[string]interface{}{"type": "string", "description": "Default USD"},
				"notes":      map[string]interface{}{"type": "string"},
				"status":     map[string]interface{}{"type": "string", "description": "completed, pending, failed"},
			}, []string{"amount"}),
		},
		{
			Name:        "rnv_overdue_clients",
			Description: "Clientes con pago vencido según su día de pago del mes.",
			Parameters:  emptyParams(),
		},
		{
			Name:        "rnv_service_control",
			Description: "Reinicia, inicia, detiene o consulta estado de un servicio en su VPS vía SSH (docker/systemctl).",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"serviceId":   map[string]interface{}{"type": "string", "description": "ID del servicio"},
					"serviceName": map[string]interface{}{"type": "string", "description": "Nombre del servicio (ej: odoo, nginx)"},
					"action":      map[string]interface{}{"type": "string", "description": "start | stop | restart | status"},
				},
			},
		},
		{
			Name:        "rnv_record_payment",
			Description: "Registra un cobro/pago de un cliente (mensual o anual). Soporta moneda DOP (Pesos) o USD (Dólares).",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"clientId":   map[string]interface{}{"type": "string"},
					"clientName": map[string]interface{}{"type": "string"},
					"amount":     map[string]interface{}{"type": "number"},
					"currency":   map[string]interface{}{"type": "string", "description": "DOP (Pesos) o USD (Dólares)"},
					"notes":      map[string]interface{}{"type": "string"},
				},
			},
		},
		{
			Name:        "rnv_update_payment",
			Description: "Edita, corrige o ajusta un pago existente (monto, moneda USD/DOP, notas, estado). Si no tienes el paymentId, modifica el último pago registrado de ese cliente.",
			Parameters: objectParams(map[string]interface{}{
				"paymentId":  map[string]interface{}{"type": "string", "description": "ID del pago"},
				"clientName": map[string]interface{}{"type": "string", "description": "Nombre del cliente para encontrar su último pago"},
				"amount":     map[string]interface{}{"type": "number", "description": "Nuevo monto corregido"},
				"currency":   map[string]interface{}{"type": "string", "description": "DOP o USD"},
				"status":     map[string]interface{}{"type": "string", "description": "completed | pending | cancelled"},
				"notes":      map[string]interface{}{"type": "string"},
			}, []string{}),
		},
		{
			Name:        "rnv_delete_payment",
			Description: "Anula y elimina del sistema un pago erróneo. Si no tienes paymentId, anula el último pago del cliente.",
			Parameters: objectParams(map[string]interface{}{
				"paymentId":  map[string]interface{}{"type": "string", "description": "ID del pago a eliminar"},
				"clientName": map[string]interface{}{"type": "string", "description": "Nombre del cliente para anular su último pago"},
			}, []string{}),
		},
		{
			Name:        "rnv_schedule_task",
			Description: "Programa recordatorio o tarea de trabajo en el calendario. Para tareas de apps usa type=work y serviceId/serviceName.",
			Parameters: objectParams(map[string]interface{}{
				"title":       map[string]interface{}{"type": "string", "description": "Título del recordatorio"},
				"description": map[string]interface{}{"type": "string"},
				"date":        map[string]interface{}{"type": "string", "description": "Fecha YYYY-MM-DD o YYYY-MM-DDTHH:MM"},
				"type":        map[string]interface{}{"type": "string", "description": "reminder|work|billing|reactivation|follow_up|custom"},
				"clientId":    map[string]interface{}{"type": "string"},
				"clientName":  map[string]interface{}{"type": "string"},
				"serviceId":   map[string]interface{}{"type": "string", "description": "ID del servicio/app"},
				"serviceName": map[string]interface{}{"type": "string", "description": "Nombre del servicio/app"},
				"notifyEmail": map[string]interface{}{"type": "boolean", "description": "Enviar email al ejecutarse"},
			}, []string{"title", "date"}),
		},
		{
			Name:        "rnv_list_calendar",
			Description: "Lista eventos del calendario: cobros, mora, tareas programadas y pagos.",
			Parameters: objectParams(map[string]interface{}{
				"from": map[string]interface{}{"type": "string", "description": "YYYY-MM-DD"},
				"to":   map[string]interface{}{"type": "string", "description": "YYYY-MM-DD"},
			}, []string{}),
		},
		{
			Name:        "rnv_list_scheduled_tasks",
			Description: "Lista tareas/recordatorios con filtros. Incluye overdue (vencidas) y stale (estancadas +3 días).",
			Parameters: objectParams(map[string]interface{}{
				"status":    map[string]interface{}{"type": "string", "description": "pending|done|cancelled"},
				"type":      map[string]interface{}{"type": "string", "description": "work|reminder|..."},
				"serviceId": map[string]interface{}{"type": "string"},
				"limit":     map[string]interface{}{"type": "integer"},
			}, []string{}),
		},
		{
			Name:        "rnv_workflow",
			Description: "Cola Mi Flujo: tareas de trabajo (type=work) agrupadas por app, con alertas de vencidas y estancadas. Úsala al iniciar sesión o cuando pregunten qué hay pendiente.",
			Parameters: objectParams(map[string]interface{}{
				"serviceId": map[string]interface{}{"type": "string", "description": "Filtrar por app/servicio"},
				"limit":     map[string]interface{}{"type": "integer"},
			}, []string{}),
		},
		{
			Name:        "rnv_complete_task",
			Description: "Marca una tarea como completada (status=done).",
			Parameters: objectParams(map[string]interface{}{
				"taskId": map[string]interface{}{"type": "string"},
				"title":  map[string]interface{}{"type": "string", "description": "Buscar por título si no hay ID"},
			}, []string{}),
		},
		{
			Name:        "rnv_probe_url",
			Description: "Detecta un servicio desde URL: tipo (odoo/web/ai), favicon, título, cliente/VPS sugerido y DNS→IP→VPS.",
			Parameters: objectParams(map[string]interface{}{
				"url": map[string]interface{}{"type": "string", "description": "URL o dominio (ej. zavinteriorclean.com)"},
			}, []string{"url"}),
		},
		{
			Name:        "rnv_create_service",
			Description: "Registra un servicio/app en un VPS. Si pasas url, detecta tipo y favicon automáticamente.",
			Parameters: objectParams(map[string]interface{}{
				"url":         map[string]interface{}{"type": "string"},
				"name":        map[string]interface{}{"type": "string"},
				"type":        map[string]interface{}{"type": "string"},
				"vpsId":       map[string]interface{}{"type": "string"},
				"vpsName":     map[string]interface{}{"type": "string"},
				"clientId":    map[string]interface{}{"type": "string"},
				"clientName":  map[string]interface{}{"type": "string"},
				"monthlyCost": map[string]interface{}{"type": "number"},
			}, []string{}),
		},
		{
			Name:        "rnv_update_service",
			Description: "Actualiza servicio (url, tipo, status, VPS, cliente, costo). Refresca favicon si cambia URL.",
			Parameters: objectParams(map[string]interface{}{
				"serviceId":   map[string]interface{}{"type": "string"},
				"name":        map[string]interface{}{"type": "string"},
				"url":         map[string]interface{}{"type": "string"},
				"type":        map[string]interface{}{"type": "string"},
				"status":      map[string]interface{}{"type": "string"},
				"vpsId":       map[string]interface{}{"type": "string"},
				"clientId":    map[string]interface{}{"type": "string"},
				"monthlyCost": map[string]interface{}{"type": "number"},
			}, []string{}),
		},
		{
			Name:        "rnv_scan_services",
			Description: "Escanea VPS vía SSH/Docker y sincroniza servicios detectados (requiere MASTER_PASSWORD).",
			Parameters: objectParams(map[string]interface{}{
				"vpsId": map[string]interface{}{"type": "string", "description": "Opcional: un VPS; si vacío escanea todos"},
			}, []string{}),
		},
		{
			Name:        "rnv_dns_lookup",
			Description: "Resuelve DNS de un dominio a IP y cruza con VPS registrados.",
			Parameters: objectParams(map[string]interface{}{
				"hostname": map[string]interface{}{"type": "string"},
				"url":      map[string]interface{}{"type": "string"},
			}, []string{}),
		},
		{
			Name:        "rnv_send_email",
			Description: "Envía email vía SMTP configurado (info@renace.tech). Para alertas, recordatorios personalizados.",
			Parameters: objectParams(map[string]interface{}{
				"to":      map[string]interface{}{"type": "string"},
				"subject": map[string]interface{}{"type": "string"},
				"body":    map[string]interface{}{"type": "string"},
				"isHtml":  map[string]interface{}{"type": "boolean"},
			}, []string{"to", "subject", "body"}),
		},
		{
			Name:        "rnv_send_whatsapp",
			Description: "Envía un mensaje de WhatsApp vía Evolution API. Si el destinatario es conocido se envía directo; si es un número nuevo o no registrado, requiere force=true o confirmación previa.",
			Parameters: objectParams(map[string]interface{}{
				"to":    map[string]interface{}{"type": "string", "description": "Teléfono destino (ej. 8099152622 o +18099152622). Vacío = correo admin"},
				"text":  map[string]interface{}{"type": "string", "description": "Mensaje (soporta *negrita* WhatsApp)"},
				"force": map[string]interface{}{"type": "boolean", "description": "true para forzar envío a un número no registrado previamente tras confirmación"},
			}, []string{"text"}),
		},
		{
			Name:        "rnv_create_affiliate_invite",
			Description: "Genera un enlace de invitación único para registrar un nuevo Colaborador / Afiliado en RNV Manager y envía el enlace por WhatsApp al número indicado.",
			Parameters: objectParams(map[string]interface{}{
				"phone":        map[string]interface{}{"type": "string", "description": "Teléfono del colaborador a invitar (ej. 8099152622)"},
				"name":         map[string]interface{}{"type": "string", "description": "Nombre o apodo del colaborador"},
				"email":        map[string]interface{}{"type": "string", "description": "Email opcional del colaborador"},
				"note":         map[string]interface{}{"type": "string", "description": "Nota interna sobre el colaborador"},
				"daysValid":    map[string]interface{}{"type": "integer", "description": "Días de validez del enlace (default 7)"},
				"sendWhatsApp": map[string]interface{}{"type": "boolean", "description": "Enviar por WhatsApp de inmediato (default true)"},
			}, []string{"phone"}),
		},
		{
			Name:        "rnv_whatsapp_report",
			Description: "Genera un reporte y lo envía por CORREO al admin (NOTIFICATION_EMAIL). WhatsApp no se usa para reportes. Tipos: dashboard, billing, offline, topology, workflow, overdue, vps, client, services.",
			Parameters: objectParams(map[string]interface{}{
				"report":      map[string]interface{}{"type": "string", "description": "dashboard|billing|offline|topology|workflow|overdue|vps|client|services"},
				"clientId":    map[string]interface{}{"type": "string"},
				"clientName":  map[string]interface{}{"type": "string"},
				"vpsId":       map[string]interface{}{"type": "string"},
				"vpsName":     map[string]interface{}{"type": "string"},
				"serviceId":   map[string]interface{}{"type": "string"},
				"serviceName": map[string]interface{}{"type": "string"},
			}, []string{"report"}),
		},
		{
			Name:        "rnv_billing_remind",
			Description: "Recordatorio de falta de pago a un cliente. channel=whatsapp envía SOLO al teléfono del cliente desde la línea 849 (Evolution). channel=email usa SMTP. No usa la lista de admin WHATSAPP_NOTIFY_NUMBERS.",
			Parameters: objectParams(map[string]interface{}{
				"clientId":   map[string]interface{}{"type": "string", "description": "ID del cliente"},
				"clientName": map[string]interface{}{"type": "string", "description": "Nombre del cliente (ej. Coca, Yeury)"},
				"channel":    map[string]interface{}{"type": "string", "description": "whatsapp|email — para cobros a clientes usa whatsapp"},
			}, []string{}),
		},
		{
			Name:        "rnv_service_health",
			Description: "Comprueba salud de servicios (HTTP URL o puerto TCP). Sin args revisa todos. Detecta caídas y genera alertas.",
			Parameters: objectParams(map[string]interface{}{
				"serviceId":   map[string]interface{}{"type": "string"},
				"serviceName": map[string]interface{}{"type": "string"},
			}, []string{}),
		},
		{
			Name:        "rnv_list_offline_services",
			Description: "Lista servicios actualmente offline/caídos.",
			Parameters:  emptyParams(),
		},
		{
			Name:        "rnv_topology",
			Description: "Mapa de infraestructura: VPS, servicios por servidor, clientes asignados, costos y estado.",
			Parameters:  emptyParams(),
		},
		{
			Name:        "rnv_list_collaborators",
			Description: "Lista colaboradores y afiliados registrados en RNV Manager, cantidad de clientes asignados a cada uno, comisiones mensuales y total de partidas de implementación, así como invitaciones pendientes. Úsala siempre que pregunten cuántos colaboradores o afiliados hay o quiénes son.",
			Parameters:  emptyParams(),
		},
		{
			Name:        "rnv_list_partidas",
			Description: "Consulta y desglosa las partidas financieras acordadas con los clientes: total de implementación, partida colaborador ($), partida empresa ($), cuota mensual recurrente ($) y split mensual colaborador/empresa. Permite filtrar por nombre de cliente o nombre de colaborador.",
			Parameters: objectParams(map[string]interface{}{
				"client":       map[string]interface{}{"type": "string", "description": "Nombre opcional del cliente a filtrar"},
				"collaborator": map[string]interface{}{"type": "string", "description": "Nombre opcional del colaborador a filtrar"},
			}, []string{}),
		},
		{
			Name:        "rnv_assign_collaborator",
			Description: "Asigna directamente un cliente a un colaborador/afiliado por nombre o ID.",
			Parameters: objectParams(map[string]interface{}{
				"clientId":         map[string]interface{}{"type": "string", "description": "ID del cliente"},
				"clientName":       map[string]interface{}{"type": "string", "description": "Nombre del cliente (ej. Franklin, Zav)"},
				"collaboratorId":   map[string]interface{}{"type": "string", "description": "ID del colaborador/afiliado"},
				"collaboratorName": map[string]interface{}{"type": "string", "description": "Nombre o email del colaborador (ej. Jean, Carlos)"},
			}, []string{}),
		},
		{
			Name:        "rnv_open_app",
			Description: "Abre aplicaciones y herramientas nativas en macOS (Pizarra, Terminal, Calculadora, Safari, Google Chrome, Notas, Finder, Cursor, VS Code, etc.).",
			Parameters: objectParams(map[string]interface{}{
				"appName": map[string]interface{}{"type": "string", "description": "Nombre de la aplicación o herramienta a abrir (ej: Pizarra, Terminal, Calculadora, Safari)"},
			}, []string{"appName"}),
		},
	}
}

const systemPrompt = `Asistente Ejecutivo RNV Manager — Centro de mando y control total con superpoderes de ejecución (clientes, colaboradores, partidas y comisiones, VPS, servicios, facturación y cobros, WhatsApp, email y herramientas macOS).

REGLAS SUPREMAS DE EXPERIENCIA DE USUARIO:
1. CERO TEXTOS LARGOS O PASIVOS ("anti-wall-of-text"):
   - Máximo 1 a 3 frases cortas, directas y resolutivas.
   - NUNCA generes cuestionarios teóricos ni le pidas al usuario "indícame el nombre de los clientes, montos...".
   - Si el usuario habla de actualizar clientes, cobrar o asignar, LLAMA DE INMEDIATO a tus herramientas (rnv_list_clients, rnv_overdue_clients, rnv_list_collaborators, rnv_list_partidas) para obtener los datos reales y mostrarlos con botones de acción directa.

2. MATERIALIZACIÓN OBLIGATORIA DE BOTONES (:::action-buttons):
   - En TODA respuesta donde haya una acción o decisión posible, genera SIEMPRE un bloque :::action-buttons con botones listos para pulsar.
   - Cada botón debe ser una acción ejecutable directa y concisa que el usuario solo tenga que presionar con un dedo/clic.

3. PAGOS Y MONEDA (DÓLARES VS PESOS):
   - Cuando el usuario te diga que un cliente pagó o se recibió un pago y no aclare si fue en Dólares (USD) o Pesos (DOP):
     Pregunta DE INMEDIATO con botones de acción:
:::action-buttons
Registrar [monto] DOP (Pesos) para [Cliente]
Registrar [monto] USD (Dólares) para [Cliente]
:::
   - Si el usuario indica "en pesos" o "DOP", usa currency='DOP'. Si indica "dólares" o "USD", usa currency='USD'.

4. EDICIÓN Y ANULACIÓN DE PAGOS (CONTROL TOTAL):
   - TIENES rnv_update_payment y rnv_delete_payment.
   - Si el usuario pide editar, cambiar la moneda (ej. de 6000 USD a 6000 Pesos), corregir el monto o anular un pago registrado por error:
     ¡NUNCA digas "no puedo editar el pago anterior"!
     Ejecuta rnv_update_payment(clientName='...', currency='DOP', amount=...) o rnv_delete_payment(clientName='...') al instante.

5. EDICIÓN DE COBROS Y DATOS DE CLIENTES:
   - TIENES rnv_update_client para cambiar precios mensuales (monthlyFee), anuales (annualFee), moneda (currency), etapas (stage) y notas de cualquier cliente.
   - TIENES rnv_assign_collaborator para asignar clientes a colaboradores al instante por nombre o ID.

HERRAMIENTAS CLAVE:
- rnv_assign_collaborator: Asigna cliente a colaborador (args: clientName, collaboratorName).
- rnv_list_collaborators: Lista colaboradores, clientes asignados y comisiones.
- rnv_list_partidas: Consulta splits de dinero (implementación y mensual) entre empresa y colaborador.
- rnv_list_clients / rnv_get_client / rnv_update_client / rnv_create_client: Gestión total de clientes y cuotas.
- rnv_overdue_clients: Lista de clientes con pagos pendientes/morosos.
- rnv_record_payment: Registra cobros a clientes (args: clientName, amount, currency='USD'|'DOP').
- rnv_update_payment: Corrige monto, moneda o estado de pagos existentes.
- rnv_delete_payment: Anula y elimina pagos erróneos del sistema.
- rnv_open_app: Abrir apps nativas en macOS (Pizarra, Calculadora, Safari, etc.).
- rnv_send_whatsapp / rnv_create_affiliate_invite / rnv_send_email: Mensajería.

BLOQUES RICOS (materializan la interfaz):
:::action-buttons
Registrar 6,000 DOP (Pesos) para Coca
Registrar 6,000 USD (Dólares) para Coca
:::

:::summary-card
Cliente: Nombre
Monto: $50
Colaborador: Jean
:::

:::quick-actions
Atajo 1
Atajo 2
:::

:::confirm
¿Confirmar acción?
:::`
