package serviceslayer

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

// WhatsAppContact is a contact from the connected Evolution instance.
type WhatsAppContact struct {
	ID          string `json:"id,omitempty"`
	RemoteJid   string `json:"remoteJid,omitempty"`
	PushName    string `json:"pushName,omitempty"`
	ProfilePic  string `json:"profilePicUrl,omitempty"`
	Phone       string `json:"phone"`
	IsGroup     bool   `json:"isGroup"`
	MatchedKind string `json:"matchedKind,omitempty"` // client | service | both | none
	ClientID    string `json:"clientId,omitempty"`
	ClientName  string `json:"clientName,omitempty"`
	ServiceID   string `json:"serviceId,omitempty"`
	ServiceName string `json:"serviceName,omitempty"`
	VpsName     string `json:"vpsName,omitempty"`
	Purpose     string `json:"purpose,omitempty"`
}

type WhatsAppDirectory struct {
	Instance string            `json:"instance"`
	State    string            `json:"state"`
	Total    int               `json:"total"`
	Matched  int               `json:"matched"`
	Contacts []WhatsAppContact `json:"contacts"`
}

func phoneFromJid(jid string) string {
	jid = strings.TrimSpace(jid)
	if strings.HasSuffix(jid, "@g.us") {
		return ""
	}
	return FormatWhatsAppRecipient(NormalizeWhatsAppNumber(jid))
}

func parseEvolutionContacts(raw []byte) []WhatsAppContact {
	var list []map[string]interface{}
	if err := json.Unmarshal(raw, &list); err != nil {
		var wrapped struct {
			Data []map[string]interface{} `json:"data"`
		}
		if err2 := json.Unmarshal(raw, &wrapped); err2 == nil && len(wrapped.Data) > 0 {
			list = wrapped.Data
		} else {
			var single map[string]interface{}
			if err3 := json.Unmarshal(raw, &single); err3 == nil {
				if arr, ok := single["contacts"].([]interface{}); ok {
					for _, item := range arr {
						if m, ok := item.(map[string]interface{}); ok {
							list = append(list, m)
						}
					}
				}
			}
		}
	}

	out := make([]WhatsAppContact, 0, len(list))
	seen := map[string]bool{}
	for _, item := range list {
		jid, _ := item["remoteJid"].(string)
		if jid == "" {
			jid, _ = item["id"].(string)
		}
		if strings.HasSuffix(jid, "@g.us") || strings.Contains(jid, "@broadcast") {
			continue
		}
		phone := phoneFromJid(jid)
		if phone == "" {
			if n, ok := item["number"].(string); ok {
				phone = FormatWhatsAppRecipient(n)
			}
		}
		if phone == "" || seen[phone] {
			continue
		}
		seen[phone] = true
		name, _ := item["pushName"].(string)
		if name == "" {
			name, _ = item["name"].(string)
		}
		pic, _ := item["profilePicUrl"].(string)
		if pic == "" {
			pic, _ = item["profilePictureUrl"].(string)
		}
		id, _ := item["id"].(string)
		out = append(out, WhatsAppContact{
			ID: id, RemoteJid: jid, PushName: name, ProfilePic: pic, Phone: phone,
		})
	}
	return out
}

// FetchWhatsAppContacts lists contacts from Evolution and matches them to RNV clients/services.
func FetchWhatsAppContacts(db *gorm.DB, cfg *config.Config) (WhatsAppDirectory, error) {
	wc := ResolveWhatsAppConfig(db, cfg)
	dir := WhatsAppDirectory{Instance: wc.Instance, Contacts: []WhatsAppContact{}}
	if !wc.IsConfigured() {
		return dir, fmt.Errorf("WhatsApp/Evolution API no configurado")
	}
	state, connected := CheckEvolutionConnection(db, cfg)
	dir.State = state
	if !connected && state != "open" && state != "connected" {
		// still try fetch; some instances return contacts while "connecting"
	}

	url := fmt.Sprintf("%s/chat/findContacts/%s", wc.APIURL, instancePath(wc.Instance))
	body, _ := json.Marshal(map[string]interface{}{"where": map[string]interface{}{}})
	raw, code, err := evolutionHTTP("POST", url, wc.APIKey, body)
	if err != nil {
		return dir, err
	}
	if code < 200 || code >= 300 {
		return dir, fmt.Errorf("%s", humanizeEvolutionError(code, string(raw)))
	}

	contacts := parseEvolutionContacts(raw)

	var clients []models.Client
	var services []models.Service
	db.Find(&clients)
	db.Preload("Client").Preload("VPS").Find(&services)

	clientByPhone := map[string]models.Client{}
	for _, cl := range clients {
		if cl.Phone == nil {
			continue
		}
		if p := FormatWhatsAppRecipient(*cl.Phone); p != "" {
			clientByPhone[p] = cl
		}
	}
	serviceByPhone := map[string]models.Service{}
	for _, svc := range services {
		if svc.WhatsAppPhone == nil {
			continue
		}
		if p := FormatWhatsAppRecipient(*svc.WhatsAppPhone); p != "" {
			serviceByPhone[p] = svc
		}
	}

	matched := 0
	for i := range contacts {
		c := &contacts[i]
		cl, hasClient := clientByPhone[c.Phone]
		svc, hasService := serviceByPhone[c.Phone]
		switch {
		case hasClient && hasService:
			c.MatchedKind = "both"
			c.ClientID, c.ClientName = cl.ID, cl.Name
			c.ServiceID, c.ServiceName = svc.ID, svc.Name
			if svc.Purpose != nil {
				c.Purpose = *svc.Purpose
			}
			if svc.VPS != nil {
				c.VpsName = svc.VPS.Name
			}
			matched++
		case hasService:
			c.MatchedKind = "service"
			c.ServiceID, c.ServiceName = svc.ID, svc.Name
			if svc.Purpose != nil {
				c.Purpose = *svc.Purpose
			}
			if svc.Client != nil {
				c.ClientID, c.ClientName = svc.Client.ID, svc.Client.Name
			}
			if svc.VPS != nil {
				c.VpsName = svc.VPS.Name
			}
			matched++
		case hasClient:
			c.MatchedKind = "client"
			c.ClientID, c.ClientName = cl.ID, cl.Name
			matched++
		default:
			c.MatchedKind = "none"
		}
	}

	dir.Contacts = contacts
	dir.Total = len(contacts)
	dir.Matched = matched
	return dir, nil
}

// LinkWhatsAppPhoneToService stores a WhatsApp number on a service for quick notify.
func LinkWhatsAppPhoneToService(db *gorm.DB, serviceID, phone string) (models.Service, error) {
	var svc models.Service
	if err := db.First(&svc, "id = ?", serviceID).Error; err != nil {
		return svc, fmt.Errorf("servicio no encontrado")
	}
	num := FormatWhatsAppRecipient(phone)
	if num == "" {
		return svc, fmt.Errorf("número WhatsApp inválido")
	}
	svc.WhatsAppPhone = &num
	if err := db.Model(&svc).Update("whatsapp_phone", num).Error; err != nil {
		return svc, err
	}
	db.Preload("Client").Preload("VPS").First(&svc, "id = ?", serviceID)
	return svc, nil
}

// ResolveNotifyTarget finds a WhatsApp number from service, client or raw phone.
func ResolveNotifyTarget(db *gorm.DB, serviceID, clientID, phone string) (string, string, error) {
	if phone != "" {
		n := FormatWhatsAppRecipient(phone)
		if n == "" {
			return "", "", fmt.Errorf("número inválido")
		}
		return n, "phone", nil
	}
	if serviceID != "" {
		var svc models.Service
		if err := db.Preload("Client").First(&svc, "id = ?", serviceID).Error; err != nil {
			return "", "", fmt.Errorf("servicio no encontrado")
		}
		if svc.WhatsAppPhone != nil && *svc.WhatsAppPhone != "" {
			return FormatWhatsAppRecipient(*svc.WhatsAppPhone), "service", nil
		}
		if svc.Client != nil && svc.Client.Phone != nil {
			return FormatWhatsAppRecipient(*svc.Client.Phone), "client", nil
		}
		return "", "", fmt.Errorf("servicio sin WhatsApp ni teléfono de cliente")
	}
	if clientID != "" {
		var cl models.Client
		if err := db.First(&cl, "id = ?", clientID).Error; err != nil {
			return "", "", fmt.Errorf("cliente no encontrado")
		}
		if cl.Phone == nil || *cl.Phone == "" {
			return "", "", fmt.Errorf("cliente sin teléfono")
		}
		return FormatWhatsAppRecipient(*cl.Phone), "client", nil
	}
	return "", "", fmt.Errorf("indica serviceId, clientId o phone")
}
