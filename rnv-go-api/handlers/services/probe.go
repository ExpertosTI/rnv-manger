package services

import (
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

var (
	titleRe   = regexp.MustCompile(`(?is)<title[^>]*>([^<]+)</title>`)
	descRe    = regexp.MustCompile(`(?is)<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']`)
	descRe2   = regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']`)
	iconRe    = regexp.MustCompile(`(?is)<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']`)
	iconRe2   = regexp.MustCompile(`(?is)<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']`)
	ogImageRe = regexp.MustCompile(`(?is)<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']`)
)

func Probe(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			URL string `json:"url"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.URL) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "url requerida"})
			return
		}

		raw := normalizeURL(body.URL)
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Host == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "URL inválida"})
			return
		}

		hostname := parsed.Hostname()
		suggestedName := subdomainName(hostname)
		html, statusCode, reachable := fetchHTML(raw)
		title, description, favicon := parseHTMLMeta(html, raw)

		if title != "" {
			clean := strings.TrimSpace(title)
			if len(clean) > 2 && !strings.EqualFold(clean, suggestedName) {
				// keep subdomain as service id; title for display
			}
		}

		isRenace := strings.HasSuffix(strings.ToLower(hostname), "renace.tech")
		suggestedType := inferTypeFromProbe(hostname, title, html, isRenace)
		status := "stopped"
		if reachable {
			status = "running"
		}

		displayTitle := title
		if displayTitle == "" {
			displayTitle = suggestedName
		}

		clientID, clientName, clientReason := suggestClient(db, hostname, suggestedName, title, description)
		vpsID, vpsName, vpsReason := suggestVPS(db, hostname, suggestedName, raw)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"url":                 raw,
				"hostname":            hostname,
				"title":               displayTitle,
				"description":         description,
				"faviconUrl":          favicon,
				"suggestedName":       suggestedName,
				"suggestedType":       suggestedType,
				"reachable":           reachable,
				"statusCode":          statusCode,
				"status":              status,
				"isRenaceApp":         isRenace,
				"suggestedClientId":   clientID,
				"suggestedClientName": clientName,
				"clientMatchReason":   clientReason,
				"suggestedVpsId":      vpsID,
				"suggestedVpsName":    vpsName,
				"vpsMatchReason":      vpsReason,
			},
		})
	}
}

func normalizeURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		raw = "https://" + raw
	}
	return raw
}

func subdomainName(hostname string) string {
	parts := strings.Split(strings.ToLower(hostname), ".")
	if len(parts) == 0 {
		return hostname
	}
	name := parts[0]
	if name == "www" && len(parts) > 1 {
		name = parts[1]
	}
	return name
}

func fetchHTML(target string) (body string, statusCode int, reachable bool) {
	client := &http.Client{Timeout: 15 * time.Second}
	for _, method := range []string{"GET", "HEAD"} {
		req, err := http.NewRequest(method, target, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; RNV-Manager/1.0)")
		req.Header.Set("Accept", "text/html,application/xhtml+xml")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		statusCode = resp.StatusCode
		reachable = statusCode > 0 && statusCode < 500
		if method == "GET" && resp.Body != nil {
			b, _ := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
			resp.Body.Close()
			body = string(b)
		} else {
			resp.Body.Close()
		}
		if reachable {
			return body, statusCode, reachable
		}
	}
	return body, statusCode, reachable
}

func parseHTMLMeta(html, pageURL string) (title, description, favicon string) {
	if html == "" {
		return "", "", ""
	}
	if m := titleRe.FindStringSubmatch(html); len(m) > 1 {
		title = strings.TrimSpace(m[1])
	}
	if m := descRe.FindStringSubmatch(html); len(m) > 1 {
		description = strings.TrimSpace(m[1])
	} else if m := descRe2.FindStringSubmatch(html); len(m) > 1 {
		description = strings.TrimSpace(m[1])
	}
	iconHref := ""
	if m := iconRe.FindStringSubmatch(html); len(m) > 1 {
		iconHref = m[1]
	} else if m := iconRe2.FindStringSubmatch(html); len(m) > 1 {
		iconHref = m[1]
	} else if m := ogImageRe.FindStringSubmatch(html); len(m) > 1 {
		iconHref = m[1]
	}
	favicon = resolveURL(pageURL, iconHref)
	return title, description, favicon
}

func resolveURL(base, href string) string {
	if href == "" {
		return ""
	}
	if strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
		return href
	}
	b, err := url.Parse(base)
	if err != nil {
		return href
	}
	ref, err := url.Parse(href)
	if err != nil {
		return href
	}
	return b.ResolveReference(ref).String()
}

func inferTypeFromProbe(host, title, html string, isRenace bool) string {
	h := strings.ToLower(host + " " + title + " " + html)
	switch {
	case strings.Contains(h, "n8n"), strings.Contains(host, "ai."):
		return "ai"
	case strings.Contains(h, "odoo"):
		return "odoo"
	case strings.Contains(host, "api"):
		return "api"
	case isRenace:
		return "web"
	default:
		return "web"
	}
}

func suggestClient(db *gorm.DB, hostname, svcName, title, description string) (*string, string, string) {
	var clients []models.Client
	db.Where("is_active = true").Find(&clients)

	// Existing service with same URL hostname
	var existing models.Service
	hostLower := strings.ToLower(hostname)
	db.Preload("Client").Where("url ILIKE ?", "%"+hostLower+"%").First(&existing)
	if existing.ClientID != nil && existing.Client != nil {
		reason := "Servicio existente con esta URL → cliente " + existing.Client.Name
		return existing.ClientID, existing.Client.Name, reason
	}

	blob := strings.ToLower(hostname + " " + svcName + " " + title + " " + description)
	blob = strings.NewReplacer(".", " ", "-", " ", "_", " ").Replace(blob)

	bestScore := 0
	var best *models.Client
	for i := range clients {
		cl := &clients[i]
		score := matchScore(blob, cl.Name)
		if cl.CompanyName != nil {
			score = max(score, matchScore(blob, *cl.CompanyName))
		}
		if score > bestScore {
			bestScore = score
			best = cl
		}
	}

	if best != nil && bestScore >= 3 {
		reason := "Nombre/título coincide con cliente «" + best.Name + "»"
		return &best.ID, best.Name, reason
	}

	if strings.HasSuffix(hostLower, "renace.tech") {
		for i := range clients {
			cl := &clients[i]
			if strings.Contains(strings.ToLower(cl.Name), "renace") {
				reason := "App interna *.renace.tech → " + cl.Name
				return &cl.ID, cl.Name, reason
			}
		}
	}

	return nil, "", ""
}

func suggestVPS(db *gorm.DB, hostname, svcName, rawURL string) (*string, string, string) {
	var svc models.Service
	db.Preload("VPS").Where("url ILIKE ? OR name ILIKE ?", "%"+hostname+"%", svcName).First(&svc)
	if svc.VpsID != nil && svc.VPS != nil {
		reason := "Servicio «" + svc.Name + "» ya está en este VPS"
		return svc.VpsID, svc.VPS.Name, reason
	}

	// VPS domain match (odoo18.tech VPS hosts odoo18.tech services)
	var vpsList []models.VPS
	db.Find(&vpsList)
	hostBase := strings.Split(strings.ToLower(hostname), ".")[0]
	for _, v := range vpsList {
		vn := strings.ToLower(strings.TrimSuffix(v.Name, ".tech"))
		if vn != "" && (vn == hostBase || strings.Contains(strings.ToLower(hostname), vn)) {
			reason := "Dominio parece alojado en VPS «" + v.Name + "»"
			id := v.ID
			return &id, v.Name, reason
		}
	}

	_ = rawURL
	return nil, "", ""
}

func matchScore(blob, term string) int {
	term = strings.ToLower(strings.TrimSpace(term))
	if term == "" {
		return 0
	}
	if strings.Contains(blob, term) {
		return len(term) + 5
	}
	words := strings.Fields(term)
	score := 0
	for _, w := range words {
		w = strings.TrimFunc(w, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsNumber(r) })
		if len(w) >= 3 && strings.Contains(blob, w) {
			score += len(w)
		}
	}
	return score
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
