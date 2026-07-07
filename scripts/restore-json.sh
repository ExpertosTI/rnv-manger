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
container_path="/backups/$base"
if [ ! -f "/backups/$base" ] 2>/dev/null; then
    docker cp "$FILE" "$api_cid:$container_path"
fi

echo "Restaurando $container_path ..."
docker exec "$api_cid" ./rnv-api -restore "$container_path"
echo "✅ Restauración JSON completada"
