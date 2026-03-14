#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="rnv-manager"
BRANCH="deploy/rnv-manager"
REPO_URL="https://github.com/ExpertosTI/rnv-manger.git"
WORKDIR="/opt/rnv-manager"
ENV_FILE="/etc/rnv-manager/rnv.env"
NETWORK_PUBLIC="RenaceNet"
NETWORK_INTERNAL="rnv_internal"
APP_DOMAIN="rnv.renace.tech"

echo "RNV Manager deploy"

run_as_root() {
    if [ "${EUID:-$(id -u)}" -eq 0 ]; then
        "$@"
    else
        sudo "$@"
    fi
}

require_command() {
    local cmd="$1"
    if command -v "$cmd" >/dev/null 2>&1; then
        return 0
    fi
    if command -v apt-get >/dev/null 2>&1; then
        run_as_root apt-get update -y
        if [ "$cmd" = "docker" ]; then
            run_as_root apt-get install -y ca-certificates curl gnupg
            run_as_root install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | run_as_root gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            run_as_root chmod a+r /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | run_as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
            run_as_root apt-get update -y
            run_as_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            run_as_root systemctl enable docker
            run_as_root systemctl start docker
        else
            run_as_root apt-get install -y "$cmd"
        fi
    else
        echo "$cmd no disponible"
        exit 1
    fi
}

generate_secret() {
    openssl rand -base64 48 | tr -d '\n'
}

generate_password() {
    openssl rand -base64 30 | tr -d '\n' | tr '/+' 'AZ'
}

require_command docker
require_command git
require_command openssl

if ! docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -qi active; then
    run_as_root docker swarm init
fi

if ! docker network inspect "$NETWORK_PUBLIC" >/dev/null 2>&1; then
    run_as_root docker network create --driver overlay --attachable "$NETWORK_PUBLIC"
fi

if ! docker network inspect "$NETWORK_INTERNAL" >/dev/null 2>&1; then
    run_as_root docker network create --driver overlay --attachable "$NETWORK_INTERNAL"
fi

if [ -d "$WORKDIR/.git" ]; then
    git -C "$WORKDIR" fetch origin
    git -C "$WORKDIR" checkout "$BRANCH"
    git -C "$WORKDIR" pull origin "$BRANCH"
else
    mkdir -p "$(dirname "$WORKDIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$WORKDIR"
fi

if [ ! -f "$ENV_FILE" ]; then
    run_as_root mkdir -p "$(dirname "$ENV_FILE")"
    DB_USER_VALUE="rnvadmin"
    DB_PASSWORD_VALUE="$(generate_password)"
    DB_NAME_VALUE="rnv_manager"
    APP_PORT_VALUE="3000"
    MASTER_PASSWORD_VALUE="${MASTER_PASSWORD:-JustWork2027@}"
    MAESTRO_PIN_VALUE="${MAESTRO_PIN:-101284}"
    SESSION_SECRET_VALUE="$(generate_secret)"
    SMTP_HOST_VALUE="${SMTP_HOST:-smtp.hostinger.com}"
    SMTP_PORT_VALUE="${SMTP_PORT:-465}"
    SMTP_USER_VALUE="${SMTP_USER:-info@renace.space}"
    SMTP_PASS_VALUE="${SMTP_PASS:-}"
    HOSTINGER_API_TOKEN_VALUE="${HOSTINGER_API_TOKEN:-}"
    ODOO_URL_VALUE="${ODOO_URL:-}"
    ODOO_DB_VALUE="${ODOO_DB:-}"
    ODOO_USERNAME_VALUE="${ODOO_USERNAME:-}"
    ODOO_API_KEY_VALUE="${ODOO_API_KEY:-}"
    cat <<EOF | run_as_root tee "$ENV_FILE" >/dev/null
DB_USER=${DB_USER_VALUE}
DB_PASSWORD=${DB_PASSWORD_VALUE}
DB_NAME=${DB_NAME_VALUE}
APP_PORT=${APP_PORT_VALUE}
MASTER_PASSWORD=${MASTER_PASSWORD_VALUE}
MAESTRO_PIN=${MAESTRO_PIN_VALUE}
SESSION_SECRET=${SESSION_SECRET_VALUE}
HOSTINGER_API_TOKEN=${HOSTINGER_API_TOKEN_VALUE}
ODOO_URL=${ODOO_URL_VALUE}
ODOO_DB=${ODOO_DB_VALUE}
ODOO_USERNAME=${ODOO_USERNAME_VALUE}
ODOO_API_KEY=${ODOO_API_KEY_VALUE}
SMTP_HOST=${SMTP_HOST_VALUE}
SMTP_PORT=${SMTP_PORT_VALUE}
SMTP_USER=${SMTP_USER_VALUE}
SMTP_PASS=${SMTP_PASS_VALUE}
EOF
    run_as_root chmod 600 "$ENV_FILE"
fi

set -a
. "$ENV_FILE"
set +a

required_vars=(
    DB_USER
    DB_PASSWORD
    DB_NAME
    APP_PORT
    MASTER_PASSWORD
    MAESTRO_PIN
    SESSION_SECRET
    SMTP_HOST
    SMTP_PORT
    SMTP_USER
    SMTP_PASS
)

for var_name in "${required_vars[@]}"; do
    value="${!var_name:-}"
    if [ -z "$value" ] || [ "$value" = "CHANGE_ME" ] || [ "$value" = "CHANGE_ME_WITH_32_PLUS_CHARS" ]; then
        echo "Variable invalida: $var_name"
        exit 1
    fi
done

if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]]; then
    echo "APP_PORT invalido"
    exit 1
fi

if [ "${#SESSION_SECRET}" -lt 32 ]; then
    echo "SESSION_SECRET debe tener al menos 32 caracteres"
    exit 1
fi

if ! grep -q "rnv.renace.tech" "$WORKDIR/deploy/stack.yml"; then
    echo "Dominio de stack invalido"
    exit 1
fi

run_as_root docker build -t rnv-manager:latest "$WORKDIR"
run_as_root docker stack deploy -c "$WORKDIR/deploy/stack.yml" "$STACK_NAME"
run_as_root docker service ls --filter "name=${STACK_NAME}_"
echo "Deploy completado: https://${APP_DOMAIN}"
echo "Variables guardadas en ${ENV_FILE}"
