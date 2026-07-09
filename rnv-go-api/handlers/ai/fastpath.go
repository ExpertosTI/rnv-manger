package ai

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/renace/rnv-go-api/config"
	"gorm.io/gorm"
)

// tryFastPath ejecuta acciones directas sin Gemini (útil si la API está saturada).
func tryFastPath(db *gorm.DB, cfg *config.Config, message string) (string, []executedFunction, bool) {
	msg := normalizeMsg(message)
	if msg == "" {
		return "", nil, false
	}

	report, opts := detectWhatsAppIntent(msg)
	if report == "" {
		return "", nil, false
	}

	executor := newToolExecutor(db, cfg)
	args := map[string]interface{}{"report": report}
	if opts.ClientName != "" {
		args["clientName"] = opts.ClientName
	}
	if opts.VpsName != "" {
		args["vpsName"] = opts.VpsName
	}
	if opts.ServiceName != "" {
		args["serviceName"] = opts.ServiceName
	}

	exec := executor.execute("rnv_whatsapp_report", args)
	executed := []executedFunction{exec}

	success, _ := exec.Result["success"].(bool)
	if !success {
		errMsg, _ := exec.Result["error"].(string)
		if errMsg == "" {
			errMsg = "no se pudo enviar el WhatsApp"
		}
		return "❌ " + errMsg, executed, true
	}

	preview, _ := exec.Result["preview"].(string)
	sentMsg, _ := exec.Result["message"].(string)
	label := reportLabel(report)

	var b strings.Builder
	b.WriteString(fmt.Sprintf("✅ *%s* enviado por WhatsApp (+1 809 Renace).\n", label))
	if sentMsg != "" {
		b.WriteString(sentMsg)
		b.WriteString("\n")
	}
	if preview != "" {
		if len(preview) > 900 {
			preview = preview[:900] + "…"
		}
		b.WriteString("\n_Vista previa:_\n")
		b.WriteString(preview)
	}
	return b.String(), executed, true
}

type intentOpts struct {
	ClientName  string
	VpsName     string
	ServiceName string
}

func reportLabel(report string) string {
	switch report {
	case "dashboard":
		return "Resumen general"
	case "billing":
		return "Reporte de pagos y facturación"
	case "overdue":
		return "Clientes morosos"
	case "offline":
		return "Servicios caídos"
	case "topology":
		return "Mapa de infraestructura"
	case "workflow":
		return "Tareas pendientes"
	case "vps":
		return "Estado VPS"
	case "client":
		return "Detalle de cliente"
	case "services":
		return "Servicios"
	default:
		return "Reporte"
	}
}

func normalizeMsg(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		switch r {
		case 'á':
			b.WriteRune('a')
		case 'é':
			b.WriteRune('e')
		case 'í':
			b.WriteRune('i')
		case 'ó':
			b.WriteRune('o')
		case 'ú', 'ü':
			b.WriteRune('u')
		case 'ñ':
			b.WriteRune('n')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func wantsDelivery(msg string) bool {
	triggers := []string{
		"mandame", "enviame", "envia", "manda",
		"reporte por", "por whatsapp", "por wa", "por watsapp",
		"un mensaje", "mensaje con", "mensaje de", "notificame", "avisame",
		"whatsappeame", "escribeme por",
	}
	for _, t := range triggers {
		if strings.Contains(msg, t) {
			return true
		}
	}
	return strings.Contains(msg, "whatsapp") || strings.Contains(msg, "watsapp")
}

func detectWhatsAppIntent(msg string) (report string, opts intentOpts) {
	if !wantsDelivery(msg) {
		return "", opts
	}

	switch {
	case containsAny(msg, "moroso", "mora", "vencido", "debe", "deuda"):
		return "overdue", opts
	case containsAny(msg, "caido", "caida", "offline", "down", "fuera de linea"):
		return "offline", opts
	case containsAny(msg, "tarea", "flujo", "workflow", "mi cola", "pendientes de trabajo"):
		return "workflow", opts
	case containsAny(msg, "mapa", "infra", "topologia", "topology", "arquitectura"):
		return "topology", opts
	case containsAny(msg, "pago pendient", "cobro", "factur", "finanza", "billing", "cobros proximo"):
		return "billing", opts
	case containsAny(msg, "resumen", "dashboard", "estado general", "como estamos", "reporte general"):
		return "dashboard", opts
	case strings.Contains(msg, "vps") || strings.Contains(msg, "servidor"):
		return "vps", opts
	case strings.Contains(msg, "servicio"):
		return "services", opts
	case strings.Contains(msg, "cliente"):
		opts.ClientName = extractAfter(msg, "cliente")
		return "client", opts
	default:
		// "mandame un mensaje con X" sin tipo claro → resumen
		if containsAny(msg, "mensaje", "whatsapp", "wa", "reporte") {
			return "dashboard", opts
		}
	}
	return "", opts
}

func containsAny(msg string, needles ...string) bool {
	for _, n := range needles {
		if strings.Contains(msg, n) {
			return true
		}
	}
	return false
}

func extractAfter(msg, keyword string) string {
	i := strings.Index(msg, keyword)
	if i < 0 {
		return ""
	}
	rest := strings.TrimSpace(msg[i+len(keyword):])
	rest = strings.TrimPrefix(rest, ":")
	rest = strings.TrimSpace(rest)
	if rest == "" {
		return ""
	}
	var words []string
	for _, w := range strings.Fields(rest) {
		w = strings.Trim(w, ".,!?\"'")
		if w == "" || isStopWord(w) {
			break
		}
		words = append(words, w)
		if len(words) >= 4 {
			break
		}
	}
	return strings.Join(words, " ")
}

func isStopWord(w string) bool {
	switch w {
	case "por", "con", "de", "del", "la", "el", "los", "las", "un", "una", "y", "en", "al":
		return true
	}
	return false
}

func isRetryableGeminiErr(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "high demand") ||
		strings.Contains(s, "resource_exhausted") ||
		strings.Contains(s, "unavailable") ||
		strings.Contains(s, "429") ||
		strings.Contains(s, "503") ||
		strings.Contains(s, "overloaded") ||
		strings.Contains(s, "quota")
}

func friendlyGeminiError(err error) string {
	if err == nil {
		return "Error desconocido"
	}
	s := err.Error()
	low := strings.ToLower(s)
	if strings.Contains(low, "high demand") || strings.Contains(low, "unavailable") || strings.Contains(low, "503") {
		return "Gemini está saturado en este momento. Reintenta en unos segundos — o pide reportes por WhatsApp con frases como «envíame los pagos pendientes por WA» (funciona sin IA)."
	}
	if strings.Contains(low, "429") || strings.Contains(low, "quota") {
		return "Cuota de Gemini agotada temporalmente. Espera un momento e intenta de nuevo."
	}
	if strings.Contains(low, "403") || strings.Contains(low, "api_key") {
		return "GEMINI_API_KEY inválida o sin permisos en el servidor."
	}
	return s
}

// stripNonAlpha for future use
func stripNonAlpha(s string) string {
	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}
