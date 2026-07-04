#!/usr/bin/env bash
# RNV Manager — Deploy (producción: Docker Swarm + Traefik/RenaceNet)
# Uso en servidor:  cd /opt/rnv-manager && ./deploy.sh update
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
STACK_NAME="rnv-manager"
COMPOSE_FILE="docker-compose.yml"
ENV_FILE="/etc/rnv-manager/rnv.env"
APP_DOMAIN="${APP_DOMAIN:-rnv.renace.tech}"
APP_URL="${APP_URL:-https://${APP_DOMAIN}}"
NETWORK_PUBLIC="RenaceNet"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${GREEN}$*${NC}"; }
warn() { echo -e "${YELLOW}$*${NC}"; }
err()  { echo -e "${RED}$*${NC}" >&2; }
die()  { err "$*"; exit 1; }

banner() {
    echo -e "${CYAN}╔═══════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║       RNV Manager — Deploy Tool       ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════╝${NC}"
}

run_as_root() {
    if [ "${EUID:-$(id -u)}" -eq 0 ]; then "$@"; else sudo "$@"; fi
}

is_swarm_active() {
    docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -qi active
}

use_swarm() {
    is_swarm_active && docker network inspect "$NETWORK_PUBLIC" >/dev/null 2>&1
}

swarm_service() { echo "${STACK_NAME}_${1}"; }

db_container_id() {
    docker ps -q -f "name=$(swarm_service db)" | head -1
}

app_container_id() {
    docker ps -q -f "name=$(swarm_service app)" | head -1
}

# ── Env ───────────────────────────────────────────────────────────────────────
load_env() {
    if [ -f "$ENV_FILE" ]; then
        set -a
        # shellcheck disable=SC1091
        source "$ENV_FILE"
        set +a
    fi
    if [ -f "$ROOT/.env" ]; then
        set -a
        # shellcheck disable=SC1091
        source "$ROOT/.env"
        set +a
    fi

    # Legacy: SESSION_SECRET → JWT_SECRET
    if [ -z "${JWT_SECRET:-}" ] && [ -n "${SESSION_SECRET:-}" ]; then
        export JWT_SECRET="$SESSION_SECRET"
    fi

    export APP_URL="${APP_URL:-https://${APP_DOMAIN}}"

    if [ -z "${DATABASE_URL:-}" ] && [ -n "${DB_USER:-}" ] && [ -n "${DB_PASSWORD:-}" ] && [ -n "${DB_NAME:-}" ]; then
        export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}?sslmode=disable"
    fi
}

ensure_env_file() {
    if [ ! -f "$ENV_FILE" ] && [ ! -f "$ROOT/.env" ]; then
        warn "⚠️  No hay $ENV_FILE ni .env — creando .env desde plantilla..."
        cp env.template "$ROOT/.env"
        die "Edita .env (o crea $ENV_FILE) y vuelve a ejecutar."
    fi
    # Siempre sincronizar producción → .env del repo
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "$ROOT/.env"
    fi
    # secrets.local opcional (GEMINI, SMTP, etc.) sin tocar git
    if [ -f "/etc/rnv-manager/secrets.local" ]; then
        set -a
        # shellcheck disable=SC1091
        source "/etc/rnv-manager/secrets.local"
        set +a
        if [ -x "$ROOT/scripts/seed-env.sh" ]; then
            "$ROOT/scripts/seed-env.sh" >/dev/null 2>&1 || true
        fi
    fi
}

validate_env() {
    load_env
    local missing=()
    for v in DB_USER DB_PASSWORD DB_NAME JWT_SECRET DATABASE_URL; do
        if [ -z "${!v:-}" ]; then missing+=("$v"); fi
    done
    if [ ${#missing[@]} -gt 0 ]; then
        die "Variables obligatorias vacías: ${missing[*]}"
    fi
    if [ "${#JWT_SECRET}" -lt 32 ]; then
        die "JWT_SECRET debe tener al menos 32 caracteres"
    fi
    if [ -z "${SMTP_PASS:-}" ]; then
        warn "⚠️  SMTP_PASS vacío — OTP por email no funcionará hasta configurarlo"
    fi
    if [ -z "${GEMINI_API_KEY:-}" ]; then
        warn "⚠️  GEMINI_API_KEY vacío — asistente IA desactivado"
    fi
}

# ── Infra ─────────────────────────────────────────────────────────────────────
ensure_docker() {
    command -v docker >/dev/null 2>&1 || die "docker no instalado"
    docker info >/dev/null 2>&1 || die "docker no responde (¿servicio activo?)"
}

ensure_swarm() {
    if ! is_swarm_active; then
        log "Inicializando Docker Swarm..."
        run_as_root docker swarm init 2>/dev/null || true
    fi
    if ! docker network inspect "$NETWORK_PUBLIC" >/dev/null 2>&1; then
        log "Creando red overlay $NETWORK_PUBLIC..."
        run_as_root docker network create --driver overlay --attachable "$NETWORK_PUBLIC"
    fi
}

git_sync() {
    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        warn "No es repositorio git — omitiendo pull"
        return 0
    fi
    log "📥 Sincronizando con origin/main..."
    git fetch origin
    git reset --hard origin/main
}

build_images() {
    validate_env
    export GIT_SHA
    GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
    log "🔨 Construyendo imágenes (app + go-api) @ ${GIT_SHA}..."
    GIT_SHA="$GIT_SHA" docker compose -f "$COMPOSE_FILE" build
    # Etiquetar también como :latest para compatibilidad local
    docker tag "rnv-manger-app:${GIT_SHA}" rnv-manger-app:latest 2>/dev/null || true
    docker tag "rnv-manger-go-api:${GIT_SHA}" rnv-manger-go-api:latest 2>/dev/null || true
}

stack_deploy() {
    validate_env
    export GIT_SHA
    GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo latest)"
    log "🚀 Desplegando stack Swarm ($STACK_NAME) @ ${GIT_SHA}..."
    GIT_SHA="$GIT_SHA" docker stack deploy -c "$COMPOSE_FILE" "$STACK_NAME"
    echo ""
    docker stack services "$STACK_NAME"
}

force_rollout() {
    use_swarm || return 0
    log "♻️  Recreando contenedores app + go-api (imagen @ ${GIT_SHA:-?})..."
    docker service update --force --image "rnv-manger-go-api:${GIT_SHA}" "$(swarm_service go-api)" >/dev/null
    docker service update --force --image "rnv-manger-app:${GIT_SHA}" "$(swarm_service app)" >/dev/null
}

compose_up() {
    validate_env
    log "🚀 Modo local: docker compose up..."
    docker compose up -d --build
    docker compose ps
}

wait_for_service() {
    local svc="$1"
    local max="${2:-120}"
    local rep=""
    echo -n "   Esperando ${svc} "
    for _ in $(seq 1 "$max"); do
        rep=$(docker service ls --filter "name=${svc}" --format '{{.Replicas}}' 2>/dev/null || echo "0/0")
        if [ "$rep" = "1/1" ]; then echo "→ OK"; return 0; fi
        echo -n "."
        sleep 2
    done
    echo "→ FALLO ($rep)"
    docker service ps "$svc" --no-trunc 2>/dev/null | head -8 || true
    docker service logs "$svc" --tail 25 2>&1 || true
    return 1
}

wait_for_stack() {
    use_swarm || return 0
    log "⏳ Esperando servicios..."
    wait_for_service "$(swarm_service db)" 60 || die "PostgreSQL no arrancó"
    wait_for_service "$(swarm_service go-api)" 120 || die "go-api no arrancó — revisa: ./deploy.sh logs-api"
    wait_for_service "$(swarm_service app)" 90 || die "app no arrancó"
}

health_check() {
    local url="${APP_URL:-https://${APP_DOMAIN}}"
    log "🏥 Health check: ${url}/api/health"
    local body="" public_body="" attempt

    for attempt in 1 2 3 4 5 6; do
        body=$(curl -sS --max-redirs 0 "${url}/api/health" 2>/dev/null) || true
        public_body="$body"
        if echo "$body" | grep -q '"status"'; then
            log "✅ API healthy (público)"
            return 0
        fi
        if [ "$attempt" -lt 6 ]; then
            echo -n "   reintento ${attempt}/5... "
            sleep 5
        fi
    done

    # Fallback: go-api directo en Swarm
    local api_cid
    api_cid="$(docker ps -q -f "name=$(swarm_service go-api)" | head -1)"
    if [ -n "$api_cid" ]; then
        body=$(docker exec "$api_cid" wget -qO- http://localhost:8080/api/health 2>/dev/null) || true
        if echo "$body" | grep -q '"status"'; then
            warn "go-api OK internamente; proxy público /api aún no responde"
            warn "Respuesta pública: ${public_body:-sin respuesta}"
            return 0
        fi
    fi
    die "API no healthy. Respuesta pública: ${public_body:-sin respuesta}"
}

deploy_production() {
    ensure_docker
    ensure_env_file
    export GIT_SHA
    GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo latest)"
    if use_swarm; then
        ensure_swarm
        build_images
        stack_deploy
        force_rollout
        wait_for_stack
        health_check
        log "✅ Desplegado: ${APP_URL}"
    else
        compose_up
        warn "Modo local (sin Swarm/RenaceNet). Producción usa Swarm."
    fi
}

deploy_update() {
    ensure_docker
    ensure_env_file
    load_env
    git_sync
    mkdir -p backups
    local db_cid
    db_cid="$(db_container_id)"
    if [ -n "$db_cid" ]; then
        log "💾 Backup previo al deploy..."
        docker exec -i "$db_cid" pg_dump -U "${DB_USER:-rnvadmin}" -Fc "${DB_NAME:-rnv_manager}" \
            > "backups/pre_deploy_$(date +%Y%m%d_%H%M%S).dump" 2>/dev/null || true
    fi
    deploy_production
}

# ── CLI ───────────────────────────────────────────────────────────────────────
banner

CMD="${1:-update}"

case "$CMD" in
    start|deploy|up)
        deploy_production
        ;;
    update)
        deploy_update
        ;;
    stop)
        if use_swarm; then
            docker stack rm "$STACK_NAME" 2>/dev/null || true
            warn "Stack eliminado. Volumen rnv_postgres_data se conserva."
        else
            docker compose down
        fi
        ;;
    restart)
        load_env
        if use_swarm; then
            for s in db go-api app backup; do
                docker service update --force "$(swarm_service "$s")" >/dev/null 2>&1 || true
            done
        else
            docker compose restart
        fi
        wait_for_stack 2>/dev/null || true
        ;;
    status)
        if use_swarm; then docker stack services "$STACK_NAME"; else docker compose ps; fi
        ;;
    health)
        load_env
        health_check
        ;;
    logs)
        if use_swarm; then docker service logs -f "$(swarm_service app)"; else docker compose logs -f app; fi
        ;;
    logs-api)
        if use_swarm; then docker service logs -f "$(swarm_service go-api)"; else docker compose logs -f go-api; fi
        ;;
    logs-db)
        if use_swarm; then docker service logs -f "$(swarm_service db)"; else docker compose logs -f db; fi
        ;;
    logs-all)
        if use_swarm; then
            docker service logs -f "$(swarm_service app)" &
            docker service logs -f "$(swarm_service go-api)" &
            docker service logs -f "$(swarm_service db)" &
            wait
        else
            docker compose logs -f
        fi
        ;;
    backup)
        load_env
        mkdir -p backups
        local_file="backups/manual_$(date +%Y%m%d_%H%M%S).dump"
        db_cid="$(db_container_id)"
        [ -n "$db_cid" ] || die "db no está corriendo"
        docker exec -i "$db_cid" pg_dump -U "${DB_USER}" -Fc "${DB_NAME}" > "$local_file"
        log "✅ Backup: $local_file ($(du -sh "$local_file" | cut -f1))"
        ;;
    restore)
        [ -n "${2:-}" ] || die "Uso: ./deploy.sh restore backups/archivo.dump"
        [ -f "$2" ] || die "Archivo no encontrado: $2"
        load_env
        warn "⚠️  Sobrescribirá la base de datos actual"
        read -r -p "¿Continuar? (y/N): " c
        [ "$c" = "y" ] || [ "$c" = "Y" ] || exit 0
        db_cid="$(db_container_id)"
        docker exec -i "$db_cid" pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists < "$2"
        log "✅ Restauración completada"
        ;;
    db)
        load_env
        db_cid="$(db_container_id)"
        docker exec -it "$db_cid" psql -U "${DB_USER}" "${DB_NAME}"
        ;;
    shell)
        app_cid="$(app_container_id)"
        docker exec -it "$app_cid" sh
        ;;
    migrate)
        load_env
        if use_swarm; then
            docker service update --force "$(swarm_service go-api)" >/dev/null
            sleep 5
            docker service logs "$(swarm_service go-api)" --tail 20 2>&1 | grep -iE "Schema migrated|AutoMigrate|Connected" || true
        else
            docker compose restart go-api
        fi
        ;;
    clean)
        docker image prune -f
        ;;
    *)
        echo ""
        echo -e "${BLUE}Uso: ./deploy.sh [comando]${NC}"
        echo ""
        echo -e "  ${GREEN}update${NC}     Pull + backup + build + deploy + health  ${CYAN}(default, producción)${NC}"
        echo -e "  ${GREEN}start${NC}      Build + deploy (sin git pull)"
        echo -e "  ${GREEN}stop${NC}       Detener stack"
        echo -e "  ${GREEN}restart${NC}    Reiniciar servicios"
        echo -e "  ${GREEN}health${NC}     Comprobar /api/health"
        echo -e "  ${GREEN}status${NC}     Réplicas Swarm"
        echo ""
        echo "  logs | logs-api | logs-db | logs-all | backup | restore | db | shell | migrate | clean"
        echo ""
        echo "  Producción: env en $ENV_FILE (JWT_SECRET o SESSION_SECRET, DATABASE_URL)"
        echo "  URL: https://${APP_DOMAIN}"
        ;;
esac
