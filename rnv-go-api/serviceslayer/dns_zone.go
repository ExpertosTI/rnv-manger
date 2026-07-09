package serviceslayer

import (
	"bufio"
	"regexp"
	"sort"
	"strings"

	"github.com/renace/rnv-go-api/models"
	"gorm.io/gorm"
)

// DNSZoneRecord is one A record from a BIND zone export.
type DNSZoneRecord struct {
	Host    string `json:"host"`
	FQDN    string `json:"fqdn"`
	IP      string `json:"ip"`
	Proxied bool   `json:"proxied"`
}

// DNSIPGroup clusters subdomains by origin IP.
type DNSIPGroup struct {
	IP           string                   `json:"ip"`
	Label        string                   `json:"label"`
	VpsID        string                   `json:"vpsId,omitempty"`
	VpsName      string                   `json:"vpsName,omitempty"`
	VpsStatus    string                   `json:"vpsStatus,omitempty"`
	RecordCount  int                      `json:"recordCount"`
	ProxiedCount int                      `json:"proxiedCount"`
	Records      []DNSZoneRecordAudit     `json:"records"`
}

// DNSZoneRecordAudit extends a zone record with RNV inventory cross-check.
type DNSZoneRecordAudit struct {
	DNSZoneRecord
	InRNV      bool   `json:"inRnv"`
	ServiceID  string `json:"serviceId,omitempty"`
	ServiceName string `json:"serviceName,omitempty"`
	Status     string `json:"status,omitempty"`
}

// DNSZoneAudit is the full depuration report.
type DNSZoneAudit struct {
	Domain       string       `json:"domain"`
	TotalRecords int          `json:"totalRecords"`
	UniqueIPs    int          `json:"uniqueIPs"`
	ByIP         []DNSIPGroup `json:"byIp"`
	InRNVOnly    []string     `json:"inRnvOnly"`    // services with renace.tech URL not in zone
	DnsOnly      int          `json:"dnsOnly"`      // in zone, not in RNV
	Matched      int          `json:"matched"`
}

var zoneARecordRe = regexp.MustCompile(`^(\S+)\s+\d+\s+IN\s+A\s+(\d+\.\d+\.\d+\.\d+)`)
var zoneProxiedRe = regexp.MustCompile(`cf-proxied:(true|false)`)

var knownIPLabels = map[string]string{
	"45.9.191.18":    "RenaceTech",
	"86.38.217.170":  "ronuimport",
	"85.31.224.232":  "Hostinger-Odoo",
	"145.223.126.55": "VP-Clientes",
	"157.173.210.205": "Bloke-Stack",
	"86.38.204.237":  "VP-204",
	"93.127.217.52":  "ECF-Rey",
	"129.222.118.53": "Cloud",
	"217.15.168.218": "NAC",
	"31.97.145.41":   "Webhook-Hostinger",
}

// ParseDNSZone extracts A records from Cloudflare/BIND zone export text.
func ParseDNSZone(zoneText, domain string) []DNSZoneRecord {
	domain = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(domain)), ".")
	if domain == "" {
		domain = "renace.tech"
	}

	var records []DNSZoneRecord
	scanner := bufio.NewScanner(strings.NewReader(zoneText))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, ";;") {
			continue
		}
		m := zoneARecordRe.FindStringSubmatch(line)
		if len(m) < 3 {
			continue
		}
		name := strings.TrimSuffix(strings.ToLower(m[1]), ".")
		ip := m[2]
		proxied := false
		if pm := zoneProxiedRe.FindStringSubmatch(line); len(pm) > 1 {
			proxied = pm[1] == "true"
		}

		host := name
		fqdn := name
		if name == domain {
			host = "@"
		} else if strings.HasSuffix(name, "."+domain) {
			host = strings.TrimSuffix(name, "."+domain)
		}

		records = append(records, DNSZoneRecord{
			Host: host, FQDN: fqdn, IP: ip, Proxied: proxied,
		})
	}
	return records
}

// AuditDNSZone cross-references zone records with VPS and services in RNV.
func AuditDNSZone(db *gorm.DB, zoneText, domain string) DNSZoneAudit {
	records := ParseDNSZone(zoneText, domain)
	if domain == "" {
		domain = "renace.tech"
	}

	var services []models.Service
	db.Preload("VPS").Find(&services)

	serviceByHost := map[string]models.Service{}
	for _, s := range services {
		if s.URL == nil {
			continue
		}
		h := hostFromURL(*s.URL)
		if h != "" {
			serviceByHost[h] = s
			// also bare subdomain
			if i := strings.Index(h, "."); i > 0 {
				serviceByHost[h[:i]+"."+domain] = s
			}
		}
		// match by service name ≈ subdomain
		serviceByHost[s.Name+".renace.tech"] = s
		serviceByHost[strings.ToLower(s.Name)+"."+domain] = s
	}

	byIP := map[string]*DNSIPGroup{}
	matched := 0
	dnsOnly := 0

	for _, rec := range records {
		g, ok := byIP[rec.IP]
		if !ok {
			label := knownIPLabels[rec.IP]
			vps := matchVPSByIP(db, rec.IP)
			g = &DNSIPGroup{
				IP: rec.IP, Label: label, Records: []DNSZoneRecordAudit{},
			}
			if vps != nil {
				g.VpsID = vps.ID
				g.VpsName = vps.Name
				g.VpsStatus = vps.Status
				if g.Label == "" {
					g.Label = vps.Name
				}
			}
			if g.Label == "" {
				g.Label = rec.IP
			}
			byIP[rec.IP] = g
		}

		audit := DNSZoneRecordAudit{DNSZoneRecord: rec}
		if svc, ok := serviceByHost[rec.FQDN]; ok {
			audit.InRNV = true
			audit.ServiceID = svc.ID
			audit.ServiceName = svc.Name
			audit.Status = svc.Status
			matched++
		} else if svc, ok := serviceByHost[rec.Host+"."+domain]; ok {
			audit.InRNV = true
			audit.ServiceID = svc.ID
			audit.ServiceName = svc.Name
			audit.Status = svc.Status
			matched++
		} else {
			dnsOnly++
		}
		if rec.Proxied {
			g.ProxiedCount++
		}
		g.Records = append(g.Records, audit)
		g.RecordCount++
	}

	groups := make([]DNSIPGroup, 0, len(byIP))
	for _, g := range byIP {
		sort.Slice(g.Records, func(i, j int) bool {
			return g.Records[i].Host < g.Records[j].Host
		})
		groups = append(groups, *g)
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].RecordCount != groups[j].RecordCount {
			return groups[i].RecordCount > groups[j].RecordCount
		}
		return groups[i].IP < groups[j].IP
	})

	// Services in RNV with renace.tech not in zone
	inZone := map[string]bool{}
	for _, rec := range records {
		inZone[rec.FQDN] = true
	}
	var inRNVOnly []string
	for _, s := range services {
		if s.URL == nil {
			continue
		}
		h := hostFromURL(*s.URL)
		if strings.Contains(h, domain) && !inZone[h] {
			inRNVOnly = append(inRNVOnly, h+" → "+s.Name)
		}
	}
	sort.Strings(inRNVOnly)

	return DNSZoneAudit{
		Domain:       domain,
		TotalRecords: len(records),
		UniqueIPs:    len(groups),
		ByIP:         groups,
		InRNVOnly:    inRNVOnly,
		DnsOnly:      dnsOnly,
		Matched:      matched,
	}
}

func hostFromURL(raw string) string {
	raw = strings.TrimSpace(strings.ToLower(raw))
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	if i := strings.Index(raw, "/"); i >= 0 {
		raw = raw[:i]
	}
	if i := strings.Index(raw, ":"); i >= 0 {
		raw = raw[:i]
	}
	return raw
}
