package serviceslayer

import (
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"

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

// ProbeResult holds URL detection output for services and AI tools.
type ProbeResult struct {
	URL                 string  `json:"url"`
	Hostname            string  `json:"hostname"`
	Title               string  `json:"title,omitempty"`
	Description         string  `json:"description,omitempty"`
	FaviconURL          string  `json:"faviconUrl,omitempty"`
	SuggestedName       string  `json:"suggestedName"`
	SuggestedType       string  `json:"suggestedType"`
	Reachable           bool    `json:"reachable"`
	StatusCode          int     `json:"statusCode"`
	Status              string  `json:"status"`
	IsRenaceApp         bool    `json:"isRenaceApp,omitempty"`
	SuggestedClientID   *string `json:"suggestedClientId,omitempty"`
	SuggestedClientName string  `json:"suggestedClientName,omitempty"`
	ClientMatchReason   string  `json:"clientMatchReason,omitempty"`
	SuggestedVPSID      *string `json:"suggestedVpsId,omitempty"`
	SuggestedVPSName    string  `json:"suggestedVpsName,omitempty"`
	VPSMatchReason      string  `json:"vpsMatchReason,omitempty"`
	ResolvedIPs         []string `json:"resolvedIps,omitempty"`
	MatchedVPSID        *string `json:"matchedVpsId,omitempty"`
	MatchedVPSName      string  `json:"matchedVpsName,omitempty"`
	MatchedVPSIP        string  `json:"matchedVpsIp,omitempty"`
}

func NormalizeURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		raw = "https://" + raw
	}
	return raw
}

func GoogleFaviconURL(hostname string) string {
	if hostname == "" {
		return ""
	}
	return "https://www.google.com/s2/favicons?domain=" + url.QueryEscape(hostname) + "&sz=128"
}

func DefaultTypeFavicon(svcType string) string {
	switch strings.ToLower(svcType) {
	case "odoo":
		return "https://www.odoo.com/favicon.ico"
	case "n8n", "ai":
		return "https://n8n.io/favicon.ico"
	case "evoapi", "evolution", "whatsapp":
		return "https://www.google.com/s2/favicons?domain=evolution-api.com&sz=128"
	case "postgres", "postgresql":
		return "https://www.postgresql.org/favicon.ico"
	case "mysql":
		return "https://www.mysql.com/favicon.ico"
	case "redis":
		return "https://redis.io/favicon.ico"
	case "nginx":
		return "https://nginx.org/favicon.ico"
	case "docker":
		return "https://www.docker.com/favicon.ico"
	default:
		return ""
	}
}

func EnrichServiceIcon(svc *models.Service) {
	if svc == nil {
		return
	}
	if svc.FaviconURL != nil && *svc.FaviconURL != "" {
		return
	}
	if def := DefaultTypeFavicon(svc.Type); def != "" {
		svc.FaviconURL = &def
	}
	if svc.URL == nil || *svc.URL == "" {
		return
	}
	pr := ProbeURL(*svc.URL)
	if pr.FaviconURL != "" {
		svc.FaviconURL = &pr.FaviconURL
		return
	}
	if pr.Hostname != "" {
		fb := GoogleFaviconURL(pr.Hostname)
		svc.FaviconURL = &fb
	}
}

func ProbeURLWithDB(db *gorm.DB, rawURL string) ProbeResult {
	pr := ProbeURL(rawURL)
	if db == nil {
		return pr
	}
	cid, cname, creason := suggestClientFromProbe(db, pr.Hostname, pr.SuggestedName, pr.Title, pr.Description)
	pr.SuggestedClientID, pr.SuggestedClientName, pr.ClientMatchReason = cid, cname, creason
	vid, vname, vreason := suggestVPSFromProbe(db, pr.Hostname, pr.SuggestedName, pr.URL)
	pr.SuggestedVPSID, pr.SuggestedVPSName, pr.VPSMatchReason = vid, vname, vreason
	if len(pr.ResolvedIPs) > 0 {
		if v := matchVPSByIP(db, pr.ResolvedIPs[0]); v != nil {
			pr.MatchedVPSID = &v.ID
			pr.MatchedVPSName = v.Name
			pr.MatchedVPSIP = v.IPAddress
			if pr.SuggestedVPSID == nil {
				pr.SuggestedVPSID = &v.ID
				pr.SuggestedVPSName = v.Name
				pr.VPSMatchReason = "DNS apunta a IP del VPS «" + v.Name + "» (" + v.IPAddress + ")"
			}
		}
	}
	return pr
}

func ProbeURL(raw string) ProbeResult {
	raw = NormalizeURL(raw)
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return ProbeResult{URL: raw, SuggestedType: "web", Status: "stopped"}
	}
	hostname := parsed.Hostname()
	suggestedName := subdomainName(hostname)
	html, statusCode, reachable := fetchProbeHTML(raw)
	title, description, favicon := parseProbeHTMLMeta(html, raw)
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
	ips, _ := LookupHostIPs(hostname)
	icon := favicon
	if icon == "" && hostname != "" {
		icon = GoogleFaviconURL(hostname)
	}
	return ProbeResult{
		URL: raw, Hostname: hostname, Title: displayTitle, Description: description,
		FaviconURL: icon, SuggestedName: suggestedName, SuggestedType: suggestedType,
		Reachable: reachable, StatusCode: statusCode, Status: status,
		IsRenaceApp: isRenace, ResolvedIPs: ips,
	}
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

func fetchProbeHTML(target string) (body string, statusCode int, reachable bool) {
	client := &http.Client{Timeout: 7 * time.Second}
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

func parseProbeHTMLMeta(html, pageURL string) (title, description, favicon string) {
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
	favicon = resolveProbeURL(pageURL, iconHref)
	return title, description, favicon
}

func resolveProbeURL(base, href string) string {
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
	case strings.Contains(h, "evolution"), strings.Contains(host, "evoapi"):
		return "evoapi"
	case strings.Contains(h, "n8n"), strings.Contains(host, "ai."):
		return "n8n"
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

func suggestClientFromProbe(db *gorm.DB, hostname, svcName, title, description string) (*string, string, string) {
	var clients []models.Client
	db.Where("is_active = true").Find(&clients)

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
		score := probeMatchScore(blob, cl.Name)
		if cl.CompanyName != nil {
			score = maxInt(score, probeMatchScore(blob, *cl.CompanyName))
		}
		if score > bestScore {
			bestScore = score
			best = cl
		}
	}
	if best != nil && bestScore >= 3 {
		return &best.ID, best.Name, "Nombre/título coincide con cliente «" + best.Name + "»"
	}
	if strings.HasSuffix(hostLower, "renace.tech") {
		for i := range clients {
			cl := &clients[i]
			if strings.Contains(strings.ToLower(cl.Name), "renace") {
				return &cl.ID, cl.Name, "App interna *.renace.tech → " + cl.Name
			}
		}
	}
	return nil, "", ""
}

func suggestVPSFromProbe(db *gorm.DB, hostname, svcName, rawURL string) (*string, string, string) {
	var svc models.Service
	db.Preload("VPS").Where("url ILIKE ? OR name ILIKE ?", "%"+hostname+"%", svcName).First(&svc)
	if svc.VpsID != nil && svc.VPS != nil {
		return svc.VpsID, svc.VPS.Name, "Servicio «" + svc.Name + "» ya está en este VPS"
	}
	var vpsList []models.VPS
	db.Find(&vpsList)
	hostBase := strings.Split(strings.ToLower(hostname), ".")[0]
	for _, v := range vpsList {
		vn := strings.ToLower(strings.TrimSuffix(v.Name, ".tech"))
		if vn != "" && (vn == hostBase || strings.Contains(strings.ToLower(hostname), vn)) {
			id := v.ID
			return &id, v.Name, "Dominio parece alojado en VPS «" + v.Name + "»"
		}
	}
	_ = rawURL
	return nil, "", ""
}

func probeMatchScore(blob, term string) int {
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

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
