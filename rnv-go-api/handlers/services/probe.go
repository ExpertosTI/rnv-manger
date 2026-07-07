package services

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func Probe() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			URL string `json:"url"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.URL) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "url requerida"})
			return
		}

		raw := strings.TrimSpace(body.URL)
		if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
			raw = "https://" + raw
		}

		parsed, err := url.Parse(raw)
		if err != nil || parsed.Host == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "URL inválida"})
			return
		}

		hostname := parsed.Hostname()
		parts := strings.Split(hostname, ".")
		suggestedName := parts[0]
		if suggestedName == "www" && len(parts) > 1 {
			suggestedName = parts[1]
		}

		suggestedType := inferTypeFromHost(hostname)
		reachable, statusCode := probeHTTP(raw)

		status := "stopped"
		if reachable {
			status = "running"
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"url":           raw,
				"hostname":      hostname,
				"suggestedName": suggestedName,
				"suggestedType": suggestedType,
				"reachable":     reachable,
				"statusCode":    statusCode,
				"status":        status,
			},
		})
	}
}

func inferTypeFromHost(host string) string {
	h := strings.ToLower(host)
	switch {
	case strings.Contains(h, "odoo"):
		return "odoo"
	case strings.Contains(h, "api"):
		return "api"
	case strings.Contains(h, "db"), strings.Contains(h, "postgres"):
		return "postgres"
	default:
		return "web"
	}
}

func probeHTTP(target string) (bool, int) {
	client := &http.Client{Timeout: 12 * time.Second}
	statusCode := 0

	for _, method := range []string{"HEAD", "GET"} {
		req, err := http.NewRequest(method, target, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "RNV-Manager/1.0")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()
		statusCode = resp.StatusCode
		return statusCode > 0 && statusCode < 500, statusCode
	}
	return false, statusCode
}
