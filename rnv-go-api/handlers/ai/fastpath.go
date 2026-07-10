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

	// 1) Cobro a cliente por WhatsApp (849 → teléfono del cliente) — antes que reportes al admin
	if paymentRemind, name := detectPaymentRemindIntent(msg); paymentRemind {
		if strings.TrimSpace(name) == "" {
			return "¿A qué cliente le aviso la falta de pago? Ejemplo: *notifícale a Coca que tiene que pagar*", nil, true
		}
		executor := newToolExecutor(db, cfg)
		args := map[string]interface{}{"channel": "whatsapp", "clientName": name}
		exec := executor.execute("rnv_billing_remind", args)
		res := asToolResultMap(exec.Result)
		if success, _ := res["success"].(bool); success {
			out, _ := res["message"].(string)
			return "✅ " + out + "\n_Enviado desde WhatsApp 849 al teléfono del cliente._", []executedFunction{exec}, true
		}
		errMsg, _ := res["error"].(string)
		if errMsg == "" {
			errMsg = "no se pudo enviar el recordatorio"
		}
		return "❌ " + errMsg, []executedFunction{exec}, true
	}

	// 2) Reportes internos al admin (WHATSAPP_NOTIFY_NUMBERS)
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
	res := asToolResultMap(exec.Result)

	success, _ := res["success"].(bool)
	if !success {
		errMsg, _ := res["error"].(string)
		if errMsg == "" {
			errMsg = "no se pudo enviar el WhatsApp"
		}
		return "❌ " + errMsg, executed, true
	}

	preview, _ := res["preview"].(string)
	sentMsg, _ := res["message"].(string)
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

func asToolResultMap(v interface{}) map[string]interface{} {
	if m, ok := v.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
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
		"notificale", "notifica", "avise", "avisale",
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
	// Cobros al cliente los maneja detectPaymentRemindIntent — no son reportes al admin
	if isClientPaymentNotify(msg) {
		return "", opts
	}
	if !wantsDelivery(msg) {
		return "", opts
	}

	switch {
	case containsAny(msg, "moroso", "mora", "vencido", "deuda") && containsAny(msg, "reporte", "lista", "mandame", "enviame", "dame"):
		return "overdue", opts
	case containsAny(msg, "caido", "caida", "offline", "down", "fuera de linea"):
		return "offline", opts
	case containsAny(msg, "tarea", "flujo", "workflow", "mi cola", "pendientes de trabajo"):
		return "workflow", opts
	case containsAny(msg, "mapa", "infra", "topologia", "topology", "arquitectura"):
		return "topology", opts
	case containsAny(msg, "pago pendient", "factur", "finanza", "billing", "cobros proximo") && containsAny(msg, "reporte", "mandame", "enviame", "dame"):
		return "billing", opts
	case containsAny(msg, "resumen", "dashboard", "estado general", "como estamos", "reporte general"):
		return "dashboard", opts
	case strings.Contains(msg, "vps") || strings.Contains(msg, "servidor"):
		return "vps", opts
	case strings.Contains(msg, "servicio"):
		return "services", opts
	case strings.Contains(msg, "cliente") && containsAny(msg, "reporte", "detalle", "info", "mandame", "enviame"):
		opts.ClientName = extractAfter(msg, "cliente")
		return "client", opts
	default:
		if containsAny(msg, "reporte") && containsAny(msg, "whatsapp", "wa", "mensaje"):
			return "dashboard", opts
	}
	return "", opts
}

// isClientPaymentNotify: "notifícale falta de pago", "dile que pague", etc. → WhatsApp al cliente (línea 849).
func isClientPaymentNotify(msg string) bool {
	if !containsAny(msg, "pagar", "pago", "mora", "debe", "factura", "cobro", "falta de pago", "vencid") {
		return false
	}
	return containsAny(msg, "notifica", "avisale", "avise", "avisale", "dile", "digale", "escribile", "escribele", "mandale", "enviale", "cobrale", "recuerdale")
}

func detectPaymentRemindIntent(msg string) (bool, string) {
	if !isClientPaymentNotify(msg) {
		// Variante: "notifica falta de pago a Coca" / "whatsapp a Yeury que pague"
		if !containsAny(msg, "pagar", "pago", "mora", "debe", "factura", "cobro", "falta de pago") {
			return false, ""
		}
		if !containsAny(msg, "notifica", "avis", "mand", "envi", "whatsapp", "wa", "dile", "digale") {
			return false, ""
		}
		// Evitar "envíame el reporte de mora" (eso es al admin)
		if containsAny(msg, "mandame", "enviame", "dame") && containsAny(msg, "reporte", "lista") {
			return false, ""
		}
	}
	name := extractClientNameForPayment(msg)
	return true, name
}

func extractClientNameForPayment(msg string) string {
	for _, key := range []string{"a ", "cliente ", "a cliente "} {
		if name := extractAfter(msg, key); name != "" {
			// Filtrar basura tipo "que pague"
			low := strings.ToLower(name)
			if containsAny(low, "que", "pagar", "pago", "falta", "whatsapp", "por") {
				parts := strings.Fields(name)
				var clean []string
				for _, p := range parts {
					pl := strings.ToLower(strings.Trim(p, ".,!?"))
					if pl == "que" || pl == "pague" || pl == "pagar" || pl == "por" || pl == "whatsapp" || pl == "wa" {
						break
					}
					clean = append(clean, p)
				}
				if len(clean) > 0 {
					return strings.Join(clean, " ")
				}
				continue
			}
			return name
		}
	}
	return ""
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
