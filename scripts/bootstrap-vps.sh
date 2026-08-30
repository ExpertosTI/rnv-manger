#!/usr/bin/env bash
# Bootstrap producción: secretos SMTP + limpieza BD + reinicio go-api + prueba OTP
# Se ejecuta automáticamente desde deploy.sh (sin nano ni pasos manuales).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/etc/rnv-manager/rnv.env"
SECRETS_LOCAL="/etc/rnv-manager/secrets.local"
STACK_GO_API="rnv-manager_go-api"
STACK_APP="rnv-manager_app"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}$*${NC}" >&2; }
warn() { echo -e "${YELLOW}$*${NC}" >&2; }
err()  { echo -e "${RED}$*${NC}" >&2; }

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
WHERE key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from');
SQL
    log "✅ SMTP en app_settings limpiado (usa env del stack)"
}

# Imagen local más reciente si el tag del servicio no existe (evita 404 tras stack deploy)
ensure_service_image() {
    local svc="$1"
    local repo="$2"
    local current best
    current="$(docker service inspect "$svc" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' 2>/dev/null || echo "")"
    [ -n "$current" ] || return 0
    if docker image inspect "$current" >/dev/null 2>&1; then
        return 0
    fi
    best="$(docker images --format '{{.Repository}}:{{.Tag}}' | grep "^${repo}:" | grep -v '<none>' | head -1)"
    if [ -n "$best" ]; then
        warn "Imagen ${current} no existe — restaurando ${best}"
        docker service update --image "$best" --force "$svc" >/dev/null
        wait_service "$svc"
    else
        err "No hay imagen local ${repo}:* — ejecuta ./deploy.sh update"
    fi
}

wait_service() {
    local svc="$1"
    local i rep
    for i in $(seq 1 60); do
        rep=$(docker service ls --filter "name=${svc}" --format '{{.Replicas}}' 2>/dev/null || echo "0/0")
        [ "$rep" = "1/1" ] && return 0
        sleep 2
    done
    warn "Servicio ${svc} no llegó a 1/1 (estado: ${rep:-?})"
    return 1
}

apply_go_api_smtp_env() {
    load_file "$ENV_FILE"
    load_file "$ROOT/.env"

    if ! docker service ls --format '{{.Name}}' 2>/dev/null | grep -qx "$STACK_GO_API"; then
        docker compose -f "$ROOT/docker-compose.yml" up -d go-api 2>/dev/null || true
        return 0
    fi

    ensure_service_image "$STACK_GO_API" "rnv-manger-go-api"
    ensure_service_image "$STACK_APP" "rnv-manger-app"

    local smtp_user="${SMTP_USER:-info@renace.tech}"
    local smtp_from="${SMTP_FROM:-info@renace.tech}"
    local smtp_host="${SMTP_HOST:-smtp.hostinger.com}"
    local smtp_port="${SMTP_PORT:-465}"
    local smtp_pass="${SMTP_PASS:-}"

    log "♻️  Aplicando SMTP en ${STACK_GO_API} (${smtp_user}:${smtp_port})..."
    docker service update \
        --env-rm SMTP_USER \
        --env-add "SMTP_USER=${smtp_user}" \
        --env-rm SMTP_FROM \
        --env-add "SMTP_FROM=${smtp_from}" \
        --env-rm SMTP_HOST \
        --env-add "SMTP_HOST=${smtp_host}" \
        --env-rm SMTP_PORT \
        --env-add "SMTP_PORT=${smtp_port}" \
        --env-rm SMTP_PASS \
        --env-add "SMTP_PASS=${smtp_pass}" \
        --force \
        "$STACK_GO_API" >/dev/null

    wait_service "$STACK_GO_API"
}

verify_go_api_smtp_env() {
    local api_cid
    api_cid="$(docker ps -q -f "name=${STACK_GO_API}" | head -1)"
    [ -n "$api_cid" ] || return 0
    log "🔍 go-api SMTP_USER=$(docker exec "$api_cid" printenv SMTP_USER 2>/dev/null || echo '?') SMTP_PORT=$(docker exec "$api_cid" printenv SMTP_PORT 2>/dev/null || echo '?')"
}

wait_for_public_api() {
    local url="${APP_URL:-https://rnv.renace.tech}"
    local i body
    for i in $(seq 1 15); do
        body=$(curl -sS --max-redirs 0 "${url}/api/health" 2>/dev/null) || body=""
        if echo "$body" | grep -q '"status"'; then
            log "✅ API pública healthy"
            return 0
        fi
        sleep 2
    done
    err "API pública no responde — revisa: docker service ps ${STACK_GO_API}"
    return 1
}

test_otp() {
    local url="${APP_URL:-https://rnv.renace.tech}"
    local email="${NOTIFICATION_EMAIL:-expertostird@gmail.com}"
    local body

    log "📧 Probando OTP → ${email}"
    body=$(curl -sS -X POST "${url}/api/auth/request-otp" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${email}\"}" 2>/dev/null) || body=""

    if echo "$body" | grep -q '"success":true'; then
        log "✅ OTP enviado correctamente"
        return 0
    fi

    if echo "$body" | grep -qi 'Demasiados intentos'; then
        log "ℹ️  API responde correctamente (límite de intentos activo)"
        return 0
    fi

    if echo "$body" | grep -qiE '535|authentication|smtp|credenciales'; then
        err "❌ SMTP sigue fallando — revisa SMTP_USER/SMTP_PASS en Hostinger"
        return 1
    fi

    if echo "$body" | grep -qi '404'; then
        err "❌ API devuelve 404 — go-api o proxy caído"
        return 1
    fi

    warn "OTP test: ${body:-sin respuesta}"
    return 1
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
    log "SMTP: info@renace.tech (MASTER_PASSWORD)"

    export SMTP_USER="info@renace.tech"
    export SMTP_FROM="info@renace.tech"
    export SMTP_HOST="${SMTP_HOST:-smtp.hostinger.com}"
    export SMTP_PORT="${SMTP_PORT:-465}"
    export SMTP_PASS="$smtp_pass"
    write_secrets_local "$smtp_pass"

    if [ -x "$ROOT/scripts/seed-env.sh" ]; then
        "$ROOT/scripts/seed-env.sh" >/dev/null
        log "✅ seed-env.sh sincronizado"
    fi

    clear_bad_smtp_in_db
    apply_go_api_smtp_env
    verify_go_api_smtp_env
    wait_for_public_api || true
    if ! test_otp; then
        warn "Reintentando OTP con SMTP_PORT=587..."
        export SMTP_PORT=587
        "$ROOT/scripts/seed-env.sh" >/dev/null 2>&1 || true
        apply_go_api_smtp_env
        wait_for_public_api || true
        test_otp || true
    fi
}

main "$@"
