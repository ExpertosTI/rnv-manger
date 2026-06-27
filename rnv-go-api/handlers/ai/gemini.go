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

type geminiRequest struct {
	SystemInstruction *geminiContent  `json:"systemInstruction,omitempty"`
	Contents          []geminiContent `json:"contents"`
	Tools             []geminiTool    `json:"tools,omitempty"`
	ToolConfig        *toolConfig     `json:"toolConfig,omitempty"`
}

type toolConfig struct {
	FunctionCallingConfig functionCallingConfig `json:"functionCallingConfig"`
}

type functionCallingConfig struct {
	Mode string `json:"mode"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error"`
}

func newGeminiClient(apiKey, model string) *geminiClient {
	if model == "" {
		model = "gemini-2.0-flash"
	}
	return &geminiClient{apiKey: apiKey, model: model}
}

func (g *geminiClient) generate(req geminiRequest) (*geminiResponse, error) {
	url := fmt.Sprintf("%s/models/%s:generateContent?key=%s", geminiBaseURL, g.model, g.apiKey)
	raw, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 90 * time.Second}).Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
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
			msg = "Quota exceeded (429): " + msg
		}
		return nil, fmt.Errorf("%s", msg)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("Gemini HTTP %d: %s", resp.StatusCode, string(body))
	}
	if len(result.Candidates) == 0 {
		return nil, fmt.Errorf("Gemini no devolvió candidatos")
	}
	return &result, nil
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

func toolDeclarations() []functionDeclaration {
	return []functionDeclaration{
		{
			Name:        "odoo_test_connection",
			Description: "Verifica la conexión con Odoo ERP y devuelve URL, base de datos y UID.",
			Parameters:  emptyParams(),
		},
		{
			Name:        "odoo_search_products",
			Description: "Busca productos en Odoo por nombre, referencia interna (SKU) o código de barras.",
			Parameters: objectParams(map[string]interface{}{
				"query": map[string]interface{}{"type": "string", "description": "Texto a buscar (nombre, SKU, barcode). Vacío lista productos activos."},
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
				"name":             map[string]interface{}{"type": "string", "description": "Nuevo nombre"},
				"list_price":       map[string]interface{}{"type": "number", "description": "Nuevo precio de venta"},
				"default_code":     map[string]interface{}{"type": "string", "description": "Nueva referencia/SKU"},
				"description_sale": map[string]interface{}{"type": "string", "description": "Nueva descripción de venta"},
				"standard_price":   map[string]interface{}{"type": "number", "description": "Nuevo coste"},
				"active":           map[string]interface{}{"type": "boolean", "description": "Activo/inactivo"},
			}, []string{"id"}),
		},
		{
			Name:        "odoo_search_partners",
			Description: "Busca contactos/clientes/proveedores en Odoo.",
			Parameters: objectParams(map[string]interface{}{
				"query": map[string]interface{}{"type": "string", "description": "Nombre o email"},
				"limit": map[string]interface{}{"type": "integer", "description": "Máximo de resultados"},
			}, []string{}),
		},
		{
			Name:        "odoo_list_categories",
			Description: "Lista categorías de productos en Odoo.",
			Parameters: objectParams(map[string]interface{}{
				"limit": map[string]interface{}{"type": "integer", "description": "Máximo de categorías"},
			}, []string{}),
		},
		{
			Name:        "rnv_list_clients",
			Description: "Lista clientes registrados en RNV Manager.",
			Parameters: objectParams(map[string]interface{}{
				"limit": map[string]interface{}{"type": "integer", "description": "Máximo de clientes"},
			}, []string{}),
		},
		{
			Name:        "rnv_list_vps",
			Description: "Lista servidores VPS en RNV Manager.",
			Parameters:  emptyParams(),
		},
		{
			Name:        "rnv_dashboard_stats",
			Description: "Obtiene estadísticas del panel: clientes, VPS, servicios, ingresos.",
			Parameters:  emptyParams(),
		},
	}
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

const systemPrompt = `Eres el Asistente IA de RNV Manager, un panel de gestión de VPS, clientes y servicios.
También tienes acceso directo a Odoo ERP para consultar y editar productos, contactos y categorías.

REGLAS:
- Responde SIEMPRE en español, de forma clara y concisa.
- Usa Markdown para tablas y listas cuando muestres datos.
- Para acciones sugeridas al usuario, incluye bloques especiales:
  :::action-buttons
  Buscar productos Odoo
  Crear producto
  Ver clientes RNV
  :::
- Para resúmenes usa :::summary-card con líneas tipo "Campo: Valor"
- Para navegar en la app usa :::navigate\n/ruta\n:::
- Antes de ELIMINAR o desactivar productos, pide confirmación con :::confirm\nDescripción\n:::
- Cuando edites productos en Odoo, confirma los cambios realizados con los valores nuevos.
- Si Odoo no está configurado, indica ir a Ajustes → Integraciones Odoo.
- Si no puedes hacer algo, explica qué falta configurar.

CAPACIDADES ODOO: buscar/crear/editar productos (product.template), buscar contactos, listar categorías.
CAPACIDADES RNV: listar clientes, VPS y estadísticas del dashboard.`
