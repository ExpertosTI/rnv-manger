#!/usr/bin/env bash
# Bootstrap producción: secretos SMTP + limpieza BD + reinicio go-api + prueba OTP
# Se ejecuta automáticamente desde deploy.sh (sin nano ni pasos manuales).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/etc/rnv-manager/rnv.env"
SECRETS_LOCAL="/etc/rnv-manager/secrets.local"
STACK_GO_API="rnv-manager_go-api"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}$*${NC}" >&2; }
warn() { echo -e "${YELLOW}$*${NC}" >&2; }
err()  { echo -e "${RED}$*${NC}" >&2; }
die()  { err "$*"; exit 1; }

load_file() {
    local f="$1"
    [ -f "$f" ] || return 0
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
}

is_gemini_key() {
    local v="$1"
    [[ -z "$v" ]] && return 1
    [[ "$v" == "${GEMINI_API_KEY:-}" ]] && return 0
    [[ "$v" =~ ^AQ\. ]] && return 0
    [[ "$v" =~ ^AIza ]] && return 0
    return 1
}

resolve_smtp_pass() {
    local candidate="${SMTP_PASS:-}"
    if is_gemini_key "$candidate"; then
        warn "SMTP_PASS era clave Gemini — corrigiendo automáticamente"
        candidate=""
    fi
    if [ -z "$candidate" ] && [ -n "${MASTER_PASSWORD:-}" ]; then
        candidate="$MASTER_PASSWORD"
    fi
    printf '%s' "$candidate"
}

write_secrets_local() {
    local smtp_pass="$1"
    mkdir -p "$(dirname "$SECRETS_LOCAL")"
    {
        echo "GEMINI_API_KEY=${GEMINI_API_KEY:-}"
        echo "GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.5-flash}"
        echo "SMTP_PASS=${smtp_pass}"
    } > "$SECRETS_LOCAL"
    chmod 600 "$SECRETS_LOCAL"
    log "✅ $SECRETS_LOCAL actualizado"
}

clear_bad_smtp_in_db() {
    local db_cid
    db_cid="$(docker ps -q -f "name=rnv-manager_db" | head -1)"
    [ -n "$db_cid" ] || return 0

    local pg_user="${DB_USER:-rnvadmin}"
    local pg_db="${DB_NAME:-rnv_manager}"

    docker exec -i "$db_cid" psql -U "$pg_user" -d "$pg_db" -v ON_ERROR_STOP=1 -q <<'SQL' 2>/dev/null || true
DELETE FROM app_settings
WHERE key = 'smtp_pass'
  AND (value LIKE 'AQ.%' OR value LIKE 'AIza%' OR value = '');
SQL
    log "✅ smtp_pass inválido eliminado de app_settings (si existía)"
}

restart_go_api() {
    if docker service ls --format '{{.Name}}' 2>/dev/null | grep -qx "$STACK_GO_API"; then
        log "♻️  Reiniciando $STACK_GO_API..."
        docker service update --force "$STACK_GO_API" >/dev/null
        local i rep
        for i in $(seq 1 60); do
            rep=$(docker service ls --filter "name=${STACK_GO_API}" --format '{{.Replicas}}' 2>/dev/null || echo "0/0")
            [ "$rep" = "1/1" ] && break
            sleep 2
        done
    elif docker compose ps go-api >/dev/null 2>&1; then
        docker compose restart go-api
    fi
}

test_otp() {
    local url="${APP_URL:-https://rnv.renace.tech}"
    local email="${NOTIFICATION_EMAIL:-expertostird@gmail.com}"
    local body code

    log "📧 Probando OTP → ${email}"
    body=$(curl -sS -X POST "${url}/api/auth/request-otp" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${email}\"}" 2>/dev/null) || body=""

    if echo "$body" | grep -q '"success":true'; then
        log "✅ OTP enviado correctamente"
        return 0
    fi

    if echo "$body" | grep -qiE '535|authentication|smtp|credenciales'; then
        err "❌ SMTP sigue fallando — MASTER_PASSWORD no es la contraseña del buzón Hostinger"
        err "   Pon SMTP_PASS real en $SECRETS_LOCAL y vuelve a correr ./deploy.sh update"
        return 1
    fi

    warn "OTP test: ${body:-sin respuesta}"
    return 0
}

main() {
    cd "$ROOT"
    # shellcheck disable=SC1091
    source "$ROOT/scripts/lib-secrets.sh"
    secrets_quarantine_if_corrupt "$SECRETS_LOCAL"

    load_file "$ENV_FILE"
    load_file "$ROOT/.env"
    secrets_load_safe "$SECRETS_LOCAL" || true

    local smtp_pass
    smtp_pass="$(resolve_smtp_pass)"
    if [ -z "$smtp_pass" ]; then
        err "No hay SMTP_PASS ni MASTER_PASSWORD en $ENV_FILE"
        exit 1
    fi
    log "SMTP_PASS ← MASTER_PASSWORD (rnv.env)"

    export SMTP_PASS="$smtp_pass"
    write_secrets_local "$smtp_pass"

    if [ -x "$ROOT/scripts/seed-env.sh" ]; then
        "$ROOT/scripts/seed-env.sh" >/dev/null
        log "✅ seed-env.sh sincronizado"
    fi

    clear_bad_smtp_in_db
    restart_go_api
    sleep 3
    test_otp || true
}

main "$@"
