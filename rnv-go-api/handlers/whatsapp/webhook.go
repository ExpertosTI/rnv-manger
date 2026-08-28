package whatsapp

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/handlers/ai"
	"github.com/renace/rnv-go-api/serviceslayer"
	"gorm.io/gorm"
)

type EvolutionWebhookPayload struct {
	Event    string                 `json:"event"`
	Instance string                 `json:"instance"`
	Data     EvolutionMessageData   `json:"data"`
}

type EvolutionMessageData struct {
	Key struct {
		RemoteJID string `json:"remoteJid"`
		FromMe    bool   `json:"fromMe"`
		ID        string `json:"id"`
	} `json:"key"`
	PushName string `json:"pushName"`
	Message  struct {
		Conversation        string `json:"conversation"`
		ExtendedTextMessage struct {
			Text string `json:"text"`
		} `json:"extendedTextMessage"`
	} `json:"message"`
	MessageType string `json:"messageType"`
}

// EvolutionWebhook handles incoming messages from Evolution API and routes them to AI Assistant
func EvolutionWebhook(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var payload EvolutionWebhookPayload
		if err := c.ShouldBindJSON(&payload); err != nil {
			// Some Evolution webhook events may have different payload format, ignore gracefully
			c.JSON(http.StatusOK, gin.H{"success": true, "status": "ignored_bad_format"})
			return
		}

		// Acknowledge immediately to Evolution API so webhook doesn't time out
		c.JSON(http.StatusOK, gin.H{"success": true, "status": "received"})

		// Process asynchronously in goroutine
		go func(p EvolutionWebhookPayload) {
			if p.Data.Key.FromMe {
				// Don't process self-sent messages to avoid infinite feedback loop
				return
			}

			// Extract message text
			text := strings.TrimSpace(p.Data.Message.Conversation)
			if text == "" && p.Data.Message.ExtendedTextMessage.Text != "" {
				text = strings.TrimSpace(p.Data.Message.ExtendedTextMessage.Text)
			}
			if text == "" {
				return
			}

			// Extract sender phone number (remove @s.whatsapp.net, @g.us)
			remoteJID := p.Data.Key.RemoteJID
			senderPhone := strings.Split(remoteJID, "@")[0]
			if senderPhone == "" {
				return
			}

			log.Printf("[WhatsApp Bot] 📩 Incoming message from %s (%s): %s", senderPhone, p.Data.PushName, text)

			// Process via AI Assistant (Gemini) with calendar/tasks/vps/billing tools
			systemContextMsg := "Instrucción del sistema: Este mensaje proviene de un usuario vía WhatsApp (" + senderPhone + " - " + p.Data.PushName + "). Responde de manera concisa, profesional y clara usando formato WhatsApp (con negritas *texto*, viñetas y emojis). Si el usuario pide agendar o posponer una cita/tarea/mantenimiento, utiliza las herramientas correspondientes para crearla o consultarla en RNV Manager."

			history := []ai.ChatMessage{
				{Role: "user", Content: systemContextMsg},
				{Role: "model", Content: "Entendido, asistiré al usuario por WhatsApp y agendaré sus compromisos directamente en RNV Manager."},
			}

			aiResp, executed, err := ai.ProcessChatMessage(db, cfg, text, history, "/calendar")
			if err != nil {
				log.Printf("[WhatsApp Bot] ⚠️ AI Processing Error: %v", err)
				_ = serviceslayer.SendWhatsApp(db, cfg, senderPhone, "⚠️ *Asistente RNV*: No pude procesar tu solicitud en este momento: "+err.Error())
				return
			}

			if len(executed) > 0 {
				log.Printf("[WhatsApp Bot] ⚙️ Executed %d tools for %s", len(executed), senderPhone)
			}

			// Send AI response back to sender
			if aiResp != "" {
				if err := serviceslayer.SendWhatsApp(db, cfg, senderPhone, aiResp); err != nil {
					log.Printf("[WhatsApp Bot] ❌ Failed to send WhatsApp reply to %s: %v", senderPhone, err)
				} else {
					log.Printf("[WhatsApp Bot] ✅ Successfully replied to %s", senderPhone)
				}
			}
		}(payload)
	}
}
