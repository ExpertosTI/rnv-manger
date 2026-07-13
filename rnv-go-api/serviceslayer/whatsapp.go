package serviceslayer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

// WhatsAppConfig holds Evolution API settings (env + app_settings).
type WhatsAppConfig struct {
	APIURL      string
	APIKey      string
	Instance    string
	NotifyNums  []string
	SenderLabel string
}

var digitsOnly = regexp.MustCompile(`\D`)

// NormalizeWhatsAppNumber strips +, spaces and @s.whatsapp.net suffix.
func NormalizeWhatsAppNumber(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "+")
	if i := strings.Index(raw, "@"); i > 0 {
		raw = raw[:i]
	}
	return digitsOnly.ReplaceAllString(raw, "")
}

// FormatWhatsAppRecipient ensures country code (DR → 1 + 809/829/849).
func FormatWhatsAppRecipient(raw string) string {
	num := NormalizeWhatsAppNumber(raw)
	if num == "" {
		return ""
	}
	if len(num) == 10 && (strings.HasPrefix(num, "809") || strings.HasPrefix(num, "829") || strings.HasPrefix(num, "849")) {
		return "1" + num
	}
	if len(num) == 11 && strings.HasPrefix(num, "1") {
		return num
	}
	return num
}

// ResolveWhatsAppConfig loads Evolution API config from env and DB settings.
func ResolveWhatsAppConfig(db *gorm.DB, cfg *config.Config) WhatsAppConfig {
	wc := WhatsAppConfig{
		APIURL:      strings.TrimRight(cfg.EvolutionAPIURL, "/"),
		APIKey:      cfg.EvolutionAPIKey,
		Instance:    cfg.EvolutionInstance,
		SenderLabel: cfg.WhatsAppSenderLabel,
	}
	if wc.SenderLabel == "" {
		wc.SenderLabel = "Renace"
	}
	for _, n := range strings.Split(cfg.WhatsAppNotifyNumbers, ",") {
		if num := FormatWhatsAppRecipient(n); num != "" {
			wc.NotifyNums = append(wc.NotifyNums, num)
		}
	}

	if db == nil {
		return wc
	}

	var settings []models.AppSettings
	db.Where("key IN ?", []string{
		"evolution_api_url", "evolution_api_key", "evolution_instance",
		"whatsapp_notify_numbers", "whatsapp_sender_label",
	}).Find(&settings)

	for _, s := range settings {
		if s.Value == "" {
			continue
		}
		switch s.Key {
		case "evolution_api_url":
			if wc.APIURL == "" {
				wc.APIURL = strings.TrimRight(s.Value, "/")
			}
		case "evolution_api_key":
			if wc.APIKey == "" {
				wc.APIKey = s.Value
			}
		case "evolution_instance":
			if wc.Instance == "" {
				wc.Instance = s.Value
			}
		case "whatsapp_notify_numbers":
			if len(wc.NotifyNums) == 0 {
				for _, n := range strings.Split(s.Value, ",") {
					if num := FormatWhatsAppRecipient(n); num != "" {
						wc.NotifyNums = append(wc.NotifyNums, num)
					}
				}
			}
		case "whatsapp_sender_label":
			if wc.SenderLabel == "Renace" || wc.SenderLabel == "" {
				wc.SenderLabel = s.Value
			}
		}
	}
	return wc
}

func (wc WhatsAppConfig) IsConfigured() bool {
	return wc.APIURL != "" && wc.APIKey != "" && wc.Instance != ""
}

func evolutionHTTP(method, urlStr, apiKey string, body []byte) ([]byte, int, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, urlStr, reader)
	if err != nil {
		return nil, 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("apikey", apiKey)

	client := &http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("evolution api: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return raw, resp.StatusCode, nil
}

func instancePath(instance string) string {
	return strings.ReplaceAll(url.PathEscape(instance), "+", "%20")
}

// CheckEvolutionConnection returns WhatsApp session state from Evolution API.
func CheckEvolutionConnection(db *gorm.DB, cfg *config.Config) (state string, connected bool) {
	wc := ResolveWhatsAppConfig(db, cfg)
	if !wc.IsConfigured() {
		return "not_configured", false
	}
	url := fmt.Sprintf("%s/instance/connectionState/%s", wc.APIURL, instancePath(wc.Instance))
	raw, code, err := evolutionHTTP(http.MethodGet, url, wc.APIKey, nil)
	if err != nil {
		return "unreachable", false
	}
	if code < 200 || code >= 300 {
		return "error", false
	}
	var parsed map[string]interface{}
	if json.Unmarshal(raw, &parsed) != nil {
		return "unknown", false
	}
	// v2: { "instance": { "state": "open" } }  or  { "state": "open" }
	state = strings.ToLower(extractConnectionState(parsed))
	connected = state == "open" || state == "connected"
	return state, connected
}

func extractConnectionState(m map[string]interface{}) string {
	if inst, ok := m["instance"].(map[string]interface{}); ok {
		if s, ok := inst["state"].(string); ok {
			return s
		}
	}
	if s, ok := m["state"].(string); ok {
		return s
	}
	return ""
}

func humanizeEvolutionError(statusCode int, raw string) string {
	low := strings.ToLower(raw)
	if strings.Contains(low, "connection closed") {
		return fmt.Sprintf(
			"La sesión de WhatsApp en Evolution está cerrada (HTTP %d). Entra a evoapi.renace.tech → Manager → instancia renace → escanea el QR o reinicia la instancia.",
			statusCode,
		)
	}
	if strings.Contains(low, "unauthorized") || statusCode == 401 {
		return "API Key de Evolution incorrecta. Revisa EVOLUTION_API_KEY en el servidor."
	}
	if strings.Contains(low, "not found") || statusCode == 404 {
		return "Instancia no encontrada en Evolution. El nombre debe coincidir exactamente con evoapi (ahora: renace). Revisa EVOLUTION_INSTANCE."
	}
	trimmed := strings.TrimSpace(raw)
	if len(trimmed) > 200 {
		trimmed = trimmed[:200] + "…"
	}
	return fmt.Sprintf("evolution api HTTP %d: %s", statusCode, trimmed)
}

func postSendText(wc WhatsAppConfig, number, text string) error {
	url := fmt.Sprintf("%s/message/sendText/%s", wc.APIURL, instancePath(wc.Instance))

	delayMs := 1200
	if v := strings.TrimSpace(os.Getenv("WA_SEND_DELAY_MS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > delayMs {
			delayMs = n
		}
	}

	// Formato v2 estándar
	bodyV2, _ := json.Marshal(map[string]interface{}{
		"number": number,
		"text":   text,
		"delay":  delayMs,
	})
	raw, code, err := evolutionHTTP(http.MethodPost, url, wc.APIKey, bodyV2)
	if err != nil {
		return err
	}
	if code >= 200 && code < 300 {
		return nil
	}

	// Fallback formato v1 (textMessage)
	bodyV1, _ := json.Marshal(map[string]interface{}{
		"number": number,
		"textMessage": map[string]string{
			"text": text,
		},
		"delay": delayMs,
	})
	raw, code, err = evolutionHTTP(http.MethodPost, url, wc.APIKey, bodyV1)
	if err != nil {
		return err
	}
	if code >= 200 && code < 300 {
		return nil
	}
	return fmt.Errorf("%s", humanizeEvolutionError(code, string(raw)))
}

// SendWhatsApp sends a text message via Evolution API from the connected instance.
func SendWhatsApp(db *gorm.DB, cfg *config.Config, to, text string) error {
	wc := ResolveWhatsAppConfig(db, cfg)
	if !wc.IsConfigured() {
		return fmt.Errorf("WhatsApp/Evolution API no configurado (EVOLUTION_* en servidor)")
	}
	num := FormatWhatsAppRecipient(to)
	if num == "" {
		return fmt.Errorf("número WhatsApp inválido")
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return fmt.Errorf("mensaje vacío")
	}

	state, connected := CheckEvolutionConnection(db, cfg)
	if !connected && state != "unreachable" && state != "unknown" && state != "error" && state != "not_configured" {
		return fmt.Errorf(
			"instancia '%s' no conectada a WhatsApp (estado: %s). Reconecta en Evolution Manager antes de enviar",
			wc.Instance, state,
		)
	}

	return postSendText(wc, num, text)
}

// SendWhatsAppToNotifyNumbers sends to WHATSAPP_NOTIFY_NUMBERS (OTP / login only).
func SendWhatsAppToNotifyNumbers(db *gorm.DB, cfg *config.Config, text string) error {
	wc := ResolveWhatsAppConfig(db, cfg)
	if !wc.IsConfigured() || len(wc.NotifyNums) == 0 {
		return fmt.Errorf("WhatsApp no configurado o sin WHATSAPP_NOTIFY_NUMBERS")
	}
	msg := strings.TrimSpace(text)
	var lastErr error
	sent := 0
	gapMs := 2000
	if v := strings.TrimSpace(os.Getenv("WA_SEND_GAP_MS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > gapMs {
			gapMs = n
		}
	}
	for i, num := range wc.NotifyNums {
		if i > 0 {
			time.Sleep(time.Duration(gapMs) * time.Millisecond)
		}
		if err := SendWhatsApp(db, cfg, num, msg); err != nil {
			lastErr = err
		} else {
			sent++
		}
	}
	if sent == 0 && lastErr != nil {
		return lastErr
	}
	return nil
}

// SendWhatsAppAlert — alertas operativas van por correo (no WhatsApp).
// Política RNV: WhatsApp solo OTP/login + mensajes a clientes.
func SendWhatsAppAlert(db *gorm.DB, cfg *config.Config, text string) error {
	if cfg == nil || cfg.NotificationEmail == "" {
		return nil
	}
	html := fmt.Sprintf(`<pre style="font-family:sans-serif;white-space:pre-wrap">%s</pre>`, text)
	return SendEmail(db, cfg, cfg.NotificationEmail, "RNV Alert", html)
}

// WhatsAppStatus returns config health for API/UI.
func WhatsAppStatus(db *gorm.DB, cfg *config.Config) map[string]interface{} {
	wc := ResolveWhatsAppConfig(db, cfg)
	state, connected := CheckEvolutionConnection(db, cfg)
	return map[string]interface{}{
		"configured":  wc.IsConfigured(),
		"connected":   connected,
		"state":       state,
		"apiUrl":      wc.APIURL,
		"instance":    wc.Instance,
		"notifyCount": len(wc.NotifyNums),
		"senderLabel": wc.SenderLabel,
		"hasApiKey":   wc.APIKey != "",
		"ready":       wc.IsConfigured() && connected,
	}
}
