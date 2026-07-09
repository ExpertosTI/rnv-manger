package serviceslayer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

// WhatsAppConfig holds Evolution API settings (env + app_settings).
type WhatsAppConfig struct {
	APIURL       string
	APIKey       string
	Instance     string
	NotifyNums   []string
	SenderLabel  string
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
		if num := NormalizeWhatsAppNumber(n); num != "" {
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
					if num := NormalizeWhatsAppNumber(n); num != "" {
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

// SendWhatsApp sends a text message via Evolution API from the connected instance.
func SendWhatsApp(db *gorm.DB, cfg *config.Config, to, text string) error {
	wc := ResolveWhatsAppConfig(db, cfg)
	if !wc.IsConfigured() {
		return fmt.Errorf("WhatsApp/Evolution API no configurado (EVOLUTION_* en servidor)")
	}
	num := NormalizeWhatsAppNumber(to)
	if num == "" {
		return fmt.Errorf("número WhatsApp inválido")
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return fmt.Errorf("mensaje vacío")
	}

	url := fmt.Sprintf("%s/message/sendText/%s", wc.APIURL, wc.Instance)
	body, _ := json.Marshal(map[string]string{
		"number": num,
		"text":   text,
	})

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", wc.APIKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("evolution api: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("evolution api HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	return nil
}

// SendWhatsAppAlert sends to all configured notification numbers.
func SendWhatsAppAlert(db *gorm.DB, cfg *config.Config, text string) error {
	wc := ResolveWhatsAppConfig(db, cfg)
	if !wc.IsConfigured() || len(wc.NotifyNums) == 0 {
		return nil
	}
	msg := strings.TrimSpace(text)
	var lastErr error
	sent := 0
	for _, num := range wc.NotifyNums {
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

// WhatsAppStatus returns config health for API/UI.
func WhatsAppStatus(db *gorm.DB, cfg *config.Config) map[string]interface{} {
	wc := ResolveWhatsAppConfig(db, cfg)
	return map[string]interface{}{
		"configured":    wc.IsConfigured(),
		"apiUrl":        wc.APIURL,
		"instance":      wc.Instance,
		"notifyCount":   len(wc.NotifyNums),
		"senderLabel":   wc.SenderLabel,
		"hasApiKey":     wc.APIKey != "",
	}
}
