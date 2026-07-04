#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== RNV Manager — Dev Stack ==="

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker no está instalado o no está en el PATH."
  echo "Instala Docker Desktop: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if [ ! -f .env ]; then
  cp env.template .env
  echo "[OK] Creado .env desde env.template"
fi

# shellcheck disable=SC1091
source .env 2>/dev/null || true

if [ -z "${SMTP_PASS:-}" ]; then
  echo ""
  echo "⚠️  SMTP_PASS está vacío en .env"
  echo "   Edita .env y pon la contraseña de info@renace.space (Hostinger)"
  echo "   Sin esto el OTP no se enviará por correo."
  echo ""
fi

echo "[1/3] Construyendo y levantando db + go-api + app..."
docker compose -f docker-compose.dev.yml up -d --build

echo "[2/3] Esperando API..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8080/api/health >/dev/null 2>&1; then
    echo "[OK] Go API respondiendo en :8080"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: API no respondió. Revisa: docker compose -f docker-compose.dev.yml logs go-api"
    exit 1
  fi
  sleep 2
done

echo "[3/3] Probando OTP a expertostird@gmail.com..."
RESP=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"expertostird@gmail.com"}')
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -n 1)

echo "HTTP $CODE — $BODY"

if [ "$CODE" = "200" ]; then
  echo ""
  echo "✅ Código OTP enviado. Revisa la bandeja de expertostird@gmail.com"
  echo "   App: http://localhost:4200/login"
elif [ "$CODE" = "503" ] || echo "$BODY" | grep -qi "SMTP\|email"; then
  echo ""
  echo "⚠️  API OK pero falló el envío de correo. Revisa SMTP_PASS en .env"
else
  echo ""
  echo "Revisa logs: docker compose -f docker-compose.dev.yml logs go-api"
fi
