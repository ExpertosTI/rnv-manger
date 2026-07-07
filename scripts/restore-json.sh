#!/usr/bin/env bash
# Restaura backup JSON (clientes, VPS, servicios) en PostgreSQL vía go-api
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="${STACK_NAME:-rnv-manager}"
FILE="${1:-backups/rnv_manager_backup_2026-03-14.json}"

if [[ "$FILE" != /* ]]; then
    FILE="$ROOT/$FILE"
fi
[ -f "$FILE" ] || { echo "Archivo no encontrado: $FILE" >&2; exit 1; }

api_cid="$(docker ps -q -f "name=${STACK_NAME}_go-api" | head -1)"
[ -n "$api_cid" ] || { echo "go-api no está corriendo" >&2; exit 1; }

base="$(basename "$FILE")"
container_path="/tmp/rnv-restore-$base"

echo "Copiando backup al contenedor..."
docker cp "$FILE" "$api_cid:$container_path"

echo "Restaurando $container_path ..."
if docker exec "$api_cid" ./rnv-api -restore "$container_path" 2>/dev/null; then
    docker exec "$api_cid" rm -f "$container_path" 2>/dev/null || true
    echo "✅ Restauración JSON completada"
    exit 0
fi

echo "⚠️  Flag -restore no disponible en esta imagen; intentando vía API bundled..."
docker exec "$api_cid" rm -f "$container_path" 2>/dev/null || true

# Montar en volumen backups si existe en el host del stack
if [ -f "$ROOT/backups/$base" ]; then
    bundled_path="/backups/$base"
    if docker exec "$api_cid" test -f "$bundled_path" 2>/dev/null; then
        docker exec "$api_cid" ./rnv-api -restore "$bundled_path" && exit 0
    fi
fi

echo "Usa Configuración → Restaurar backup incluido, o despliega la imagen nueva con ./deploy.sh update" >&2
exit 1
