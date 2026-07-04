#!/usr/bin/env bash
# Sincroniza secretos de producción → /etc/rnv-manager/rnv.env → .env del repo
# Uso (en el VPS):
#   GEMINI_API_KEY=xxx SMTP_PASS=yyy ./scripts/seed-env.sh
#   ./scripts/seed-env.sh /etc/rnv-manager/secrets.local
set -euo pipefail

ENV_FILE="/etc/rnv-manager/rnv.env"
SECRETS_LOCAL="/etc/rnv-manager/secrets.local"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ENV="$ROOT/.env"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "${GREEN}$*${NC}" >&2; }
warn() { echo -e "${YELLOW}$*${NC}" >&2; }

upsert_env() {
    local key="$1" val="$2" file="$3"
    [ -n "$val" ] || return 0
    mkdir -p "$(dirname "$file")"
    touch "$file"
    chmod 600 "$file"
    if grep -q "^${key}=" "$file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${val}|" "$file"
    else
        echo "${key}=${val}" >> "$file"
    fi
}

load_file() {
    local f="$1"
    [ -f "$f" ] || return 0
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
}

is_gemini_smtp_pass() {
    local v="${SMTP_PASS:-}"
    [ -z "$v" ] && return 1
    [ "$v" = "${GEMINI_API_KEY:-}" ] && return 0
    [[ "$v" =~ ^AQ\. ]] && return 0
    [[ "$v" =~ ^AIza ]] && return 0
    return 1
}

# 1) Archivo opcional pasado como argumento
if [ -n "${1:-}" ] && [ -f "$1" ]; then
    load_file "$1"
fi

# 2) secrets.local en el servidor (no va a git)
# shellcheck disable=SC1091
source "$ROOT/scripts/lib-secrets.sh"
secrets_quarantine_if_corrupt "$SECRETS_LOCAL"
secrets_load_safe "$SECRETS_LOCAL" || true

# Corregir SMTP_PASS si es una API key de Gemini
if is_gemini_smtp_pass; then
    warn "SMTP_PASS inválida (API key Gemini) — usando MASTER_PASSWORD"
    SMTP_PASS=""
fi
if [ -z "${SMTP_PASS:-}" ] && [ -n "${MASTER_PASSWORD:-}" ]; then
    export SMTP_PASS="$MASTER_PASSWORD"
    warn "SMTP_PASS ← MASTER_PASSWORD (rnv.env)"
fi

# 3) Variables ya exportadas en el shell (GEMINI_API_KEY=... ./scripts/seed-env.sh)
KEYS=(
    DB_USER DB_PASSWORD DB_NAME DATABASE_URL
    JWT_SECRET SESSION_SECRET APP_URL GIN_MODE
    MASTER_PASSWORD NOTIFICATION_EMAIL
    SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM
    HOSTINGER_API_TOKEN
    ODOO_URL ODOO_DB ODOO_USERNAME ODOO_API_KEY
    GEMINI_API_KEY GEMINI_MODEL
    VAULT_MASTER_KEY VAULT_MASTER_KEY_OLD
)

# Base: plantilla si no existe rnv.env
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ROOT/env.template" ]; then
        cp "$ROOT/env.template" "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        log "Creado $ENV_FILE desde env.template"
    else
        touch "$ENV_FILE"
        chmod 600 "$ENV_FILE"
    fi
fi

# Upsert cada variable presente en el entorno
for k in "${KEYS[@]}"; do
    v="${!k:-}"
    upsert_env "$k" "$v" "$ENV_FILE"
done

# Defaults de producción si faltan
load_file "$ENV_FILE"
upsert_env "APP_URL" "${APP_URL:-https://rnv.renace.tech}" "$ENV_FILE"
upsert_env "GIN_MODE" "${GIN_MODE:-release}" "$ENV_FILE"
upsert_env "GEMINI_MODEL" "${GEMINI_MODEL:-gemini-2.5-flash}" "$ENV_FILE"
upsert_env "SMTP_HOST" "${SMTP_HOST:-smtp.hostinger.com}" "$ENV_FILE"
upsert_env "SMTP_PORT" "${SMTP_PORT:-465}" "$ENV_FILE"
upsert_env "SMTP_USER" "${SMTP_USER:-info@renace.space}" "$ENV_FILE"
upsert_env "SMTP_FROM" "${SMTP_FROM:-info@renace.space}" "$ENV_FILE"
upsert_env "NOTIFICATION_EMAIL" "${NOTIFICATION_EMAIL:-expertostird@gmail.com}" "$ENV_FILE"

# Copiar a .env del repo (deploy.sh lo usa)
cp "$ENV_FILE" "$REPO_ENV"
chmod 600 "$REPO_ENV"

log "✅ Secretos sincronizados: $ENV_FILE → $REPO_ENV"

load_file "$ENV_FILE"
[ -n "${GEMINI_API_KEY:-}" ] && log "   GEMINI_API_KEY: configurada" || warn "   GEMINI_API_KEY: vacía"
[ -n "${SMTP_PASS:-}" ] && log "   SMTP_PASS: configurada" || warn "   SMTP_PASS: vacía — OTP no enviará correo"
