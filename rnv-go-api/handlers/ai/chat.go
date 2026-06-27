package ai

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/config"
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
	gemini := newGeminiClient(cfg.GeminiAPIKey, cfg.GeminiModel)
	executor := newToolExecutor(db, cfg)

	contents := buildContents(req)
	tools := []geminiTool{{FunctionDeclarations: toolDeclarations()}}

	var allExecuted []executedFunction
	const maxTurns = 8

	for turn := 0; turn < maxTurns; turn++ {
		genReq := geminiRequest{
			SystemInstruction: &geminiContent{
				Role:  "user",
				Parts: []geminiPart{{Text: systemPrompt + pageContext(req.URL)}},
			},
			Contents: contents,
			Tools:    tools,
			ToolConfig: &toolConfig{
				FunctionCallingConfig: functionCallingConfig{Mode: "AUTO"},
			},
		}

		resp, err := gemini.generate(genReq)
		if err != nil {
			return "", allExecuted, err
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
					Response: exec.Result,
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
		role := msg.Role
		if role != "user" && role != "model" {
			if role == "assistant" {
				role = "model"
			} else {
				continue
			}
		}
		contents = append(contents, geminiContent{
			Role:  role,
			Parts: []geminiPart{{Text: msg.Content}},
		})
	}

	contents = append(contents, geminiContent{
		Role:  "user",
		Parts: []geminiPart{{Text: req.Message}},
	})
	return contents
}

func pageContext(url string) string {
	if url == "" {
		return ""
	}
	return "\n\nEl usuario está en la página: " + url + "."
}
