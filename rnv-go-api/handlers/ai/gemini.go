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
	if model == "" {
		model = "gemini-2.5-flash"
	}
	return &geminiClient{
		apiKey: apiKey,
		model:  model,
		http:   &http.Client{Timeout: 90 * time.Second},
	}
}

func (g *geminiClient) generate(req geminiRequest) (*geminiResponse, error) {
	if req.GenerationConfig == nil {
		req.GenerationConfig = &generationConfig{
			Temperature:     0.4,
			TopP:            0.95,
			MaxOutputTokens: 4096,
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
			if resp.StatusCode == 429 {
				lastErr = fmt.Errorf("Quota exceeded (429): %s", msg)
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
				"query":     map[string]interface{}{"type": "string", "description": "Filtrar por nombre o email"},
				"active":    map[string]interface{}{"type": "boolean", "description": "Solo activos (default true)"},
				"limit":     map[string]interface{}{"type": "integer"},
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
			Description: "Crea un nuevo cliente en RNV Manager.",
			Parameters: objectParams(map[string]interface{}{
				"name":        map[string]interface{}{"type": "string"},
				"email":       map[string]interface{}{"type": "string"},
				"phone":       map[string]interface{}{"type": "string"},
				"companyName": map[string]interface{}{"type": "string"},
				"monthlyFee":  map[string]interface{}{"type": "number", "description": "Cuota mensual base"},
				"paymentDay":  map[string]interface{}{"type": "integer", "description": "Día de pago (1-28)"},
				"notes":       map[string]interface{}{"type": "string"},
			}, []string{"name"}),
		},
		{
			Name:        "rnv_update_client",
			Description: "Actualiza datos de un cliente existente.",
			Parameters: objectParams(map[string]interface{}{
				"id":          map[string]interface{}{"type": "string", "description": "ID del cliente"},
				"name":        map[string]interface{}{"type": "string"},
				"email":       map[string]interface{}{"type": "string"},
				"phone":       map[string]interface{}{"type": "string"},
				"companyName": map[string]interface{}{"type": "string"},
				"monthlyFee":  map[string]interface{}{"type": "number"},
				"paymentDay":  map[string]interface{}{"type": "integer"},
				"isActive":    map[string]interface{}{"type": "boolean"},
				"notes":       map[string]interface{}{"type": "string"},
			}, []string{"id"}),
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
			Description: "Registra un cobro/pago mensual de un cliente (recurrente).",
			Parameters: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"clientId":   map[string]interface{}{"type": "string"},
					"clientName": map[string]interface{}{"type": "string"},
					"amount":     map[string]interface{}{"type": "number"},
					"notes":      map[string]interface{}{"type": "string"},
				},
			},
		},
	}
}

const systemPrompt = `Eres el Asistente IA de RNV Manager — panel de control de infraestructura VPS, clientes, servicios y facturación.
También tienes acceso a Odoo ERP (productos, contactos, categorías).

PERSONALIDAD:
- Profesional, proactivo y conciso. Responde SIEMPRE en español.
- Ejecuta herramientas cuando necesites datos reales; no inventes cifras ni IDs.
- Puedes reiniciar servicios (rnv_service_control) y registrar cobros (rnv_record_payment).
- Para morosos usa rnv_overdue_clients; para resumen financiero rnv_billing_summary.
- Si falta un dato (ID, monto), pregunta o busca por nombre antes de fallar.

FORMATO DE RESPUESTA:
- Usa Markdown (tablas, listas, negritas) para datos.
- Resúmenes numéricos con bloques:
  :::summary-card
  Clientes: 12
  Ingresos: $4,500
  :::
- Acciones sugeridas:
  :::action-buttons
  Ver clientes activos
  Registrar un pago
  :::
- Atajos rápidos al inicio:
  :::quick-actions
  Resumen financiero
  Listar VPS
  :::
- Navegación en la app:
  :::navigate
  /clients
  :::
- Confirmación antes de mutaciones sensibles (pagos, desactivar, asignar). NUNCA pidas PIN ni contraseñas:
  :::confirm
  ¿Registrar pago de $100 a Juan Pérez?
  :::
- Animaciones opcionales: :::animate\ncelebrate\n::: o barrel-roll / shivering
- Gráficos simples (CSV):
  :::metrics-chart
  Mes,Ingresos,Gastos
  Ene,4000,1200
  Feb,4500,1300
  :::

REGLAS DE SEGURIDAD:
- NUNCA elimines datos sin confirmación explícita del usuario.
- Antes de crear pagos o asignar servicios, confirma montos y destinatario.
- Si Odoo no está configurado, indica ir a Ajustes → Integraciones Odoo.
- Si una herramienta falla, explica el error y ofrece alternativas.

CAPACIDADES RNV: buscar global, clientes (CRUD), VPS, servicios, asignar servicios, facturación, pagos, morosos, dashboard.
CAPACIDADES ODOO: productos (CRUD), contactos, categorías, test de conexión.`
