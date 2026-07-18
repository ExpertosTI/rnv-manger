package serviceslayer

import (
	"fmt"

	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

// WhatsAppContact is an explicitly registered RNV recipient.
// Evolution's generic contact book is deliberately never imported.
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

// FetchWhatsAppContacts builds a safe directory only from numbers explicitly
// stored in RNV. It never calls Evolution findContacts and never imports a
// generic instance's contacts/chats.
func FetchWhatsAppContacts(db *gorm.DB, cfg *config.Config) (WhatsAppDirectory, error) {
	wc := ResolveWhatsAppConfig(db, cfg)
	dir := WhatsAppDirectory{Instance: wc.Instance, Contacts: []WhatsAppContact{}}
	if !wc.IsConfigured() {
		return dir, fmt.Errorf("WhatsApp/Evolution API no configurado")
	}
	state, _ := CheckEvolutionConnection(db, cfg)
	dir.State = state

	var clients []models.Client
	var services []models.Service
	db.Find(&clients)
	db.Preload("Client").Preload("VPS").Find(&services)

	byPhone := map[string]*WhatsAppContact{}
	for _, cl := range clients {
		if cl.Phone == nil {
			continue
		}
		if p := FormatWhatsAppRecipient(*cl.Phone); p != "" {
			byPhone[p] = &WhatsAppContact{
				Phone: p, PushName: cl.Name, MatchedKind: "client",
				ClientID: cl.ID, ClientName: cl.Name,
			}
		}
	}
	for _, svc := range services {
		if svc.WhatsAppPhone == nil {
			continue
		}
		if p := FormatWhatsAppRecipient(*svc.WhatsAppPhone); p != "" {
			contact, exists := byPhone[p]
			if !exists {
				contact = &WhatsAppContact{Phone: p, PushName: svc.Name}
				byPhone[p] = contact
			}
			if contact.ClientID != "" {
				contact.MatchedKind = "both"
			} else {
				contact.MatchedKind = "service"
			}
			contact.ServiceID, contact.ServiceName = svc.ID, svc.Name
			if svc.Purpose != nil {
				contact.Purpose = *svc.Purpose
			}
			if svc.VPS != nil {
				contact.VpsName = svc.VPS.Name
			}
			if contact.ClientID == "" && svc.Client != nil {
				contact.ClientID, contact.ClientName = svc.Client.ID, svc.Client.Name
			}
		}
	}

	contacts := make([]WhatsAppContact, 0, len(byPhone))
	for _, contact := range byPhone {
		contacts = append(contacts, *contact)
	}
	dir.Contacts = contacts
	dir.Total = len(contacts)
	dir.Matched = len(contacts)
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

// ResolveNotifyTarget only resolves explicitly registered RNV entities.
func ResolveNotifyTarget(db *gorm.DB, serviceID, clientID string) (string, string, error) {
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
	return "", "", fmt.Errorf("indica serviceId o clientId registrado en RNV")
}

// IsKnownWhatsAppRecipient prevents generic/arbitrary Evolution recipients.
func IsKnownWhatsAppRecipient(db *gorm.DB, cfg *config.Config, phone string) bool {
	target := FormatWhatsAppRecipient(phone)
	if target == "" {
		return false
	}
	for _, admin := range ResolveWhatsAppConfig(db, cfg).NotifyNums {
		if target == FormatWhatsAppRecipient(admin) {
			return true
		}
	}
	var clients []models.Client
	db.Where("phone IS NOT NULL AND phone <> ''").Find(&clients)
	for _, client := range clients {
		if client.Phone != nil && target == FormatWhatsAppRecipient(*client.Phone) {
			return true
		}
	}
	var services []models.Service
	db.Where("whatsapp_phone IS NOT NULL AND whatsapp_phone <> ''").Find(&services)
	for _, service := range services {
		if service.WhatsAppPhone != nil && target == FormatWhatsAppRecipient(*service.WhatsAppPhone) {
			return true
		}
	}
	return false
}
