package ai

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Message string        `json:"message"`
	History []chatMessage `json:"history"`
	URL     string        `json:"url"`
}

var entityPathRe = regexp.MustCompile(`^/(clients|vps|services)/([a-zA-Z0-9_-]+)`)

func Chat(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if cfg.GeminiAPIKey == "" {
			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"error":   "GEMINI_API_KEY no configurada. Añádela al .env del servidor.",
			})
			return
		}

		var req chatRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if req.Message == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "message requerido"})
			return
		}

		// Cap history to keep tokens under control
		if len(req.History) > 8 {
			req.History = req.History[len(req.History)-8:]
		}

		response, executed, err := runChat(db, cfg, req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":           true,
			"response":          response,
			"executedFunctions": executed,
		})
	}
}

func runChat(db *gorm.DB, cfg *config.Config, req chatRequest) (string, []executedFunction, error) {
	// Ruta rápida: WhatsApp/reportes sin depender de Gemini
	if response, executed, ok := tryFastPath(db, cfg, req.Message); ok {
		return response, executed, nil
	}

	gemini := newGeminiClient(cfg.GeminiAPIKey, cfg.GeminiModel)
	executor := newToolExecutor(db, cfg)

	contents := buildContents(req)
	tools := []geminiTool{{FunctionDeclarations: toolDeclarations()}}
	sysPrompt := systemPrompt + pageContext(db, req.URL)

	var allExecuted []executedFunction
	const maxTurns = 6

	for turn := 0; turn < maxTurns; turn++ {
		genReq := geminiRequest{
			SystemInstruction: &geminiContent{
				Role:  "user",
				Parts: []geminiPart{{Text: sysPrompt}},
			},
			Contents: contents,
			Tools:    tools,
			ToolConfig: &toolConfig{
				FunctionCallingConfig: functionCallingConfig{Mode: "AUTO"},
			},
		}

		resp, err := gemini.generate(genReq)
		if err != nil {
			return "", allExecuted, fmt.Errorf("%s", friendlyGeminiError(err))
		}

		candidate := resp.Candidates[0].Content
		calls := extractFunctionCalls(candidate)

		if len(calls) == 0 {
			text := extractText(candidate)
			if text == "" {
				text = "Listo. ¿En qué más puedo ayudarte?"
			}
			return text, allExecuted, nil
		}

		contents = append(contents, candidate)

		responseParts := make([]geminiPart, 0, len(calls))
		for _, call := range calls {
			if call.Args == nil {
				call.Args = map[string]interface{}{}
			}
			exec := executor.execute(call.Name, call.Args)
			allExecuted = append(allExecuted, exec)
			responseParts = append(responseParts, geminiPart{
				FunctionResponse: &functionResponse{
					Name:     call.Name,
					Response: compactToolResult(call.Name, exec.Result),
				},
			})
		}

		contents = append(contents, geminiContent{
			Role:  "user",
			Parts: responseParts,
		})
	}

	return "He ejecutado varias operaciones. ¿Necesitas algo más?", allExecuted, nil
}

func buildContents(req chatRequest) []geminiContent {
	var contents []geminiContent

	for _, msg := range req.History {
		if msg.Content == "" {
			continue
		}
		// Strip rich-block markup from history to save tokens
		content := stripRichBlocks(msg.Content)
		if content == "" {
			continue
		}
		role := msg.Role
		if role != "user" && role != "model" {
			if role == "assistant" {
				role = "model"
			} else {
				continue
			}
		}
		// Truncate very long history messages
		if len(content) > 600 {
			content = content[:600] + "…"
		}
		contents = append(contents, geminiContent{
			Role:  role,
			Parts: []geminiPart{{Text: content}},
		})
	}

	contents = append(contents, geminiContent{
		Role:  "user",
		Parts: []geminiPart{{Text: req.Message}},
	})
	return contents
}

func stripRichBlocks(s string) string {
	re := regexp.MustCompile(`:::[\w][\w-]*\n[\s\S]*?:::`)
	return strings.TrimSpace(re.ReplaceAllString(s, ""))
}

func pageContext(db *gorm.DB, url string) string {
	if url == "" {
		return ""
	}

	var b strings.Builder
	b.WriteString("\n\nCONTEXTO DE PÁGINA:\nEl usuario está en: ")
	b.WriteString(url)

	matches := entityPathRe.FindStringSubmatch(url)
	if len(matches) == 3 {
		entity, id := matches[1], matches[2]
		switch entity {
		case "clients":
			var c models.Client
			if err := db.Select("id, name, email, monthly_fee, annual_fee, billing_cycle, total_monthly_cost, payment_day, payment_month, is_active").
				First(&c, "id = ?", id).Error; err == nil {
				b.WriteString("\nCliente actual: ")
				b.WriteString(c.Name)
				b.WriteString(" (id=")
				b.WriteString(c.ID)
				b.WriteString(")")
				if c.Email != nil {
					b.WriteString(", email=")
					b.WriteString(*c.Email)
				}
			}
		case "vps":
			var v models.VPS
			if err := db.Select("id, name, ip_address, status, monthly_cost, provider").
				First(&v, "id = ?", id).Error; err == nil {
				b.WriteString("\nVPS actual: ")
				b.WriteString(v.Name)
				b.WriteString(" (id=")
				b.WriteString(v.ID)
				b.WriteString(", ip=")
				b.WriteString(v.IPAddress)
				b.WriteString(", status=")
				b.WriteString(v.Status)
				b.WriteString(")")
			}
		case "services":
			var s models.Service
			if err := db.Select("id, name, type, status, monthly_cost").
				First(&s, "id = ?", id).Error; err == nil {
				b.WriteString("\nServicio actual: ")
				b.WriteString(s.Name)
				b.WriteString(" (id=")
				b.WriteString(s.ID)
				b.WriteString(", type=")
				b.WriteString(s.Type)
				b.WriteString(")")
			}
		}
	}

	b.WriteString("\nUsa este contexto para responder sin pedir IDs que ya conoces.")
	return b.String()
}
