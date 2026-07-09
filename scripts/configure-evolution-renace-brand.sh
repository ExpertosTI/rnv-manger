#!/usr/bin/env bash
# Branding Renace + nginx inject para Evolution Manager
# Ejecutar en ronuimport: ./scripts/configure-evolution-renace-brand.sh
set -euo pipefail

INSTALL_DIR="${EVOLUTION_DIR:-/opt/evolution-api}"
DOMAIN="${EVOLUTION_DOMAIN:-evoapi.renace.tech}"
BRAND_DIR="${INSTALL_DIR}/brand"
NGX="/etc/nginx/sites-available/${DOMAIN}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_BRAND="${SCRIPT_DIR}/../deploy/stacks/evolution-api/brand"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log() { echo -e "${GREEN}▸ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }

[[ -f "${INSTALL_DIR}/.env" ]] || { echo "No existe ${INSTALL_DIR}/.env"; exit 1; }

mkdir -p "$BRAND_DIR"
if [[ -f "${REPO_BRAND}/renace-brand.css" ]]; then
  cp "${REPO_BRAND}/renace-brand.css" "${BRAND_DIR}/renace-brand.css"
else
  curl -fsSL "https://raw.githubusercontent.com/ExpertosTI/rnv-manger/main/deploy/stacks/evolution-api/brand/renace-brand.css" \
    -o "${BRAND_DIR}/renace-brand.css"
fi

log "Actualizando .env (identidad Renace)"
ENV_FILE="${INSTALL_DIR}/.env"
touch "$ENV_FILE"
grep -q '^SERVER_NAME=' "$ENV_FILE" && sed -i 's|^SERVER_NAME=.*|SERVER_NAME=renace|' "$ENV_FILE" || echo 'SERVER_NAME=renace' >> "$ENV_FILE"
grep -q '^SERVER_URL=' "$ENV_FILE" && sed -i "s|^SERVER_URL=.*|SERVER_URL=https://${DOMAIN}|" "$ENV_FILE" || echo "SERVER_URL=https://${DOMAIN}" >> "$ENV_FILE"
grep -q '^CONFIG_SESSION_PHONE_CLIENT=' "$ENV_FILE" && sed -i 's|^CONFIG_SESSION_PHONE_CLIENT=.*|CONFIG_SESSION_PHONE_CLIENT=Renace WhatsApp|' "$ENV_FILE" || echo 'CONFIG_SESSION_PHONE_CLIENT=Renace WhatsApp' >> "$ENV_FILE"
grep -q '^QRCODE_COLOR=' "$ENV_FILE" && sed -i "s|^QRCODE_COLOR=.*|QRCODE_COLOR='#26a681'|" "$ENV_FILE" || echo "QRCODE_COLOR='#26a681'" >> "$ENV_FILE"
grep -q '^LANGUAGE=' "$ENV_FILE" && sed -i 's|^LANGUAGE=.*|LANGUAGE=es|' "$ENV_FILE" || echo 'LANGUAGE=es' >> "$ENV_FILE"
grep -q '^DATABASE_CONNECTION_CLIENT_NAME=' "$ENV_FILE" && sed -i 's|^DATABASE_CONNECTION_CLIENT_NAME=.*|DATABASE_CONNECTION_CLIENT_NAME=evolution_renace|' "$ENV_FILE" || true

cd "$INSTALL_DIR"
docker compose up -d api

if [[ ! -f "$NGX" ]]; then
  warn "No encuentro $NGX — configura nginx manualmente"
  exit 0
fi

EVO_IP=$(docker inspect evolution_api --format '{{(index .NetworkSettings.Networks "evolution-net").IPAddress}}')
log "nginx → ${EVO_IP}:8080 + CSS Renace en /manager"

cat > "$NGX" <<NGINX
server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location = /renace-brand.css {
        alias ${BRAND_DIR}/renace-brand.css;
        add_header Cache-Control "public, max-age=3600";
    }

    location / {
        proxy_pass http://${EVO_IP}:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Accept-Encoding "";
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        sub_filter '</head>' '<link rel="stylesheet" href="/renace-brand.css"/><title>Renace WhatsApp</title></head>';
        sub_filter_once on;
    }
}

server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}
NGINX

ln -sf "$NGX" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx -t && systemctl reload nginx

APIKEY=$(cat "${INSTALL_DIR}/.api-key" 2>/dev/null || echo "")
cat <<EOF

════════════════════════════════════════════════════════════
  Renace WhatsApp — Evolution Manager
════════════════════════════════════════════════════════════
  URL Manager:  https://${DOMAIN}/manager
  Server URL:   https://${DOMAIN}
  API Key:      ${APIKEY}

  En el login del Manager:
    1. Server URL → https://${DOMAIN}   (sin "c" al final)
    2. API Key Global → pegar la clave de arriba
    3. Login

  Instancia WhatsApp: renace
  QR / conectar: pestaña Instances → renace → Connect
════════════════════════════════════════════════════════════
EOF
