package ai

import (
	"encoding/json"
	"strings"
)

// compactToolResult shrinks tool output before sending back to Gemini (saves tokens).
func compactToolResult(name string, result interface{}) interface{} {
	m, ok := result.(map[string]interface{})
	if !ok {
		return result
	}

	success, _ := m["success"].(bool)
	if !success {
		out := map[string]interface{}{"success": false}
		if e, ok := m["error"].(string); ok {
			out["error"] = truncate(e, 200)
		}
		return out
	}

	switch {
	case strings.HasPrefix(name, "rnv_list_") || strings.HasPrefix(name, "odoo_search"):
		return compactListResult(m)
	case strings.HasPrefix(name, "rnv_get_") || strings.HasPrefix(name, "odoo_get_"):
		return compactItemResult(m)
	case name == "rnv_billing_summary" || name == "rnv_dashboard_stats":
		return compactNested(m, 1200)
	case name == "rnv_topology":
		return compactTopology(m)
	case name == "rnv_list_calendar":
		return compactEvents(m)
	default:
		return compactGeneric(m)
	}
}

func compactListResult(m map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{"success": true}
	if c, ok := m["count"]; ok {
		out["count"] = c
	}
	for _, key := range []string{"clients", "vps", "services", "payments", "products", "partners", "tasks", "events"} {
		if raw, ok := m[key]; ok {
			out[key] = truncateSlice(raw, 8)
		}
	}
	if msg, ok := m["message"].(string); ok {
		out["message"] = truncate(msg, 120)
	}
	return out
}

func compactItemResult(m map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{"success": true}
	for _, key := range []string{"client", "vps", "service", "product", "task", "billing", "stats"} {
		if v, ok := m[key]; ok {
			out[key] = truncateValue(v, 800)
		}
	}
	if msg, ok := m["message"].(string); ok {
		out["message"] = truncate(msg, 120)
	}
	return out
}

func compactEvents(m map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{"success": true}
	if c, ok := m["count"]; ok {
		out["count"] = c
	}
	if raw, ok := m["events"]; ok {
		out["events"] = truncateSlice(raw, 12)
	}
	return out
}

func compactTopology(m map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{"success": true}
	if t, ok := m["totals"]; ok {
		out["totals"] = t
	}
	if raw, ok := m["clusters"]; ok {
		out["clusters"] = truncateSlice(raw, 10)
	}
	return out
}

func compactGeneric(m map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{"success": true}
	for k, v := range m {
		if k == "success" {
			continue
		}
		out[k] = truncateValue(v, 400)
	}
	return out
}

func compactNested(m map[string]interface{}, max int) map[string]interface{} {
	raw, _ := json.Marshal(m)
	if len(raw) <= max {
		return m
	}
	out := map[string]interface{}{"success": true}
	for k, v := range m {
		if k == "success" {
			continue
		}
		out[k] = truncateValue(v, 300)
	}
	return out
}

func truncateSlice(v interface{}, max int) interface{} {
	switch arr := v.(type) {
	case []map[string]interface{}:
		if len(arr) <= max {
			return arr
		}
		return arr[:max]
	case []interface{}:
		if len(arr) <= max {
			return arr
		}
		return arr[:max]
	default:
		return v
	}
}

func truncateValue(v interface{}, max int) interface{} {
	raw, err := json.Marshal(v)
	if err != nil || len(raw) <= max {
		return v
	}
	if s, ok := v.(string); ok {
		return truncate(s, max)
	}
	return map[string]interface{}{"_truncated": true, "preview": truncate(string(raw), max)}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
