#!/usr/bin/env bash
# Quita n8n del VPS e instala Evolution API (WhatsApp) con Traefik.
# Ejecutar EN EL VPS como root (ej. ronuimport.srl / 86.38.217.170):
#
#   curl -sSL https://raw.githubusercontent.com/ExpertosTI/rnv-manger/main/scripts/replace-n8n-with-evolution.sh | bash -s -- --domain evoapi.renace.tech
#   # o, con repo ya clonado:
#   ./scripts/replace-n8n-with-evolution.sh --domain evoapi.renace.tech
#
set -euo pipefail

DOMAIN="${EVOLUTION_DOMAIN:-evoapi.renace.tech}"
INSTALL_DIR="${EVOLUTION_DIR:-/opt/evolution-api}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups}"
GITHUB_RAW="${GITHUB_RAW:-https://raw.githubusercontent.com/ExpertosTI/rnv-manger/main}"
SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
if [[ -f "$SCRIPT_PATH" ]]; then
    REPO_ROOT="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
else
    REPO_ROOT=""
fi
STACK_DIR="${REPO_ROOT:+$REPO_ROOT/deploy/stacks/evolution-api}"
DRY_RUN=0
REMOVE_N8N=1

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}▸ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
err()  { echo -e "${RED}✗ $*${NC}" >&2; }

usage() {
    cat <<EOF
Uso: $0 [opciones]

  --domain HOST     Dominio público (default: evoapi.renace.tech)
  --dir PATH        Directorio de instalación (default: /opt/evolution-api)
  --keep-n8n        No eliminar contenedores n8n
  --dry-run         Solo mostrar qué haría
  -h, --help        Ayuda

Variables de entorno:
  EVOLUTION_DOMAIN, EVOLUTION_DIR, BACKUP_ROOT
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        --dir) INSTALL_DIR="$2"; shift 2 ;;
        --keep-n8n) REMOVE_N8N=0; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) err "Opción desconocida: $1"; usage; exit 1 ;;
    esac
done

require_root() {
    if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
        err "Ejecuta como root en el VPS destino"
        exit 1
    fi
}

require_docker() {
    command -v docker >/dev/null || { err "Docker no instalado"; exit 1; }
    docker info >/dev/null 2>&1 || { err "Docker no responde"; exit 1; }
}

find_n8n_containers() {
    docker ps -a --format '{{.Names}}|{{.Image}}' 2>/dev/null \
        | grep -iE 'n8n|n8nio' || true
}

find_n8n_by_host() {
    docker ps -q 2>/dev/null | while read -r cid; do
        docker inspect "$cid" --format '{{.Name}} {{range $k,$v := .Config.Labels}}{{if eq $k "traefik.http.routers.n8n.rule"}}{{$v}}{{end}}{{end}}' 2>/dev/null \
            | grep -i 'Host(`ai.renace.tech`)' && docker inspect "$cid" --format '{{.Name}}' | tr -d '/'
    done || true
}

detect_n8n_domain() {
    local cid host
    for cid in $(docker ps -q 2>/dev/null); do
        host="$(docker inspect "$cid" --format '{{json .Config.Labels}}' 2>/dev/null \
            | grep -oE 'Host\(`[^`]+`\)' | head -1 | sed -E "s/Host\(\`([^\`]+)\`\)/\1/")" || true
        if echo "$host" | grep -qiE 'ai\.|n8n'; then
            echo "$host"
            return 0
        fi
    done
    return 1
}

backup_n8n() {
    local ts dir
    ts="$(date +%Y%m%d-%H%M%S)"
    dir="${BACKUP_ROOT}/n8n-${ts}"
    mkdir -p "$dir"

    log "Backup n8n → ${dir}"
    docker ps -a --format '{{.Names}}|{{.Image}}' | grep -iE 'n8n|n8nio' > "${dir}/containers.txt" || true

    while read -r line; do
        [[ -z "$line" ]] && continue
        local name="${line%%|*}"
        log "  exportando volumenes de ${name}"
        docker inspect "$name" --format '{{range .Mounts}}{{.Name}} {{end}}' 2>/dev/null \
            | tr ' ' '\n' | grep -v '^$' | sort -u | while read -r vol; do
                [[ -z "$vol" ]] && continue
                docker run --rm -v "${vol}:/data" -v "${dir}:/backup" alpine \
                    tar czf "/backup/${name}-${vol}.tar.gz" -C /data . 2>/dev/null || warn "  no se pudo respaldar volumen ${vol}"
            done
    done < <(find_n8n_containers)

    cp -a "${STACK_DIR}/../.." "${dir}/rnv-repo-snapshot" 2>/dev/null || true
    log "Backup listo: ${dir}"
}

remove_n8n() {
    local names
    names="$(find_n8n_containers | cut -d'|' -f1 | tr '\n' ' ')"
    if [[ -z "${names// /}" ]]; then
        warn "No se encontraron contenedores n8n"
        return 0
    fi

    for name in $names; do
        name="${name%%|*}"
        log "Deteniendo y eliminando ${name}"
        if [[ "$DRY_RUN" -eq 1 ]]; then
            warn "[dry-run] docker rm -f ${name}"
        else
            docker rm -f "$name" >/dev/null 2>&1 || true
        fi
    done

    # compose stacks comunes
    for dir in /opt/n8n /root/n8n /opt/stacks/n8n "$HOME/n8n"; do
        if [[ -f "${dir}/docker-compose.yml" ]] || [[ -f "${dir}/docker-compose.yaml" ]]; then
            log "Bajando stack en ${dir}"
            if [[ "$DRY_RUN" -eq 1 ]]; then
                warn "[dry-run] docker compose -f ${dir}/docker-compose.yml down"
            else
                (cd "$dir" && docker compose down -v 2>/dev/null) || true
            fi
        fi
    done
}

ensure_renacenet() {
    if ! docker network inspect RenaceNet >/dev/null 2>&1; then
        err "Red RenaceNet no existe — Traefik debe estar activo en este VPS"
        exit 1
    fi
}

gen_secret() {
    openssl rand -hex 24
}

prepare_stack() {
    local pg_pass api_key src tmp
    src="$STACK_DIR"
    mkdir -p "$INSTALL_DIR"

    if [[ -z "$src" ]] || [[ ! -f "${src}/docker-compose.yml" ]]; then
        log "Descargando stack desde GitHub (${GITHUB_RAW})"
        tmp="$(mktemp -d)"
        curl -fsSL "${GITHUB_RAW}/deploy/stacks/evolution-api/docker-compose.yml" -o "${tmp}/docker-compose.yml"
        curl -fsSL "${GITHUB_RAW}/deploy/stacks/evolution-api/env.template" -o "${tmp}/env.template"
        src="$tmp"
    fi

    cp "${src}/docker-compose.yml" "${INSTALL_DIR}/"
    cp "${src}/env.template" "${INSTALL_DIR}/.env.template"

    pg_pass="$(gen_secret)"
    api_key="$(gen_secret)"

    sed -e "s|EVOLUTION_DOMAIN=.*|EVOLUTION_DOMAIN=${DOMAIN}|" \
        -e "s|SERVER_URL=.*|SERVER_URL=https://${DOMAIN}|" \
        -e "s|POSTGRES_PASSWORD=CHANGE_ME|POSTGRES_PASSWORD=${pg_pass}|" \
        -e "s|postgresql://evolution:CHANGE_ME@|postgresql://evolution:${pg_pass}@|" \
        -e "s|AUTHENTICATION_API_KEY=CHANGE_ME|AUTHENTICATION_API_KEY=${api_key}|" \
        "${INSTALL_DIR}/.env.template" > "${INSTALL_DIR}/.env"
    chmod 600 "${INSTALL_DIR}/.env"

    echo "$api_key" > "${INSTALL_DIR}/.api-key"
    chmod 600 "${INSTALL_DIR}/.api-key"
    log "Stack preparado en ${INSTALL_DIR}"
}

deploy_evolution() {
    if [[ "$DRY_RUN" -eq 1 ]]; then
        warn "[dry-run] docker compose up -d en ${INSTALL_DIR}"
        return 0
    fi

    cd "$INSTALL_DIR"
    docker compose pull
    docker compose up -d

    local i code
    for i in $(seq 1 30); do
        code="$(curl -sS -o /dev/null -w '%{http_code}' "https://${DOMAIN}/" 2>/dev/null || echo 000)"
        if [[ "$code" =~ ^(200|401|403|404)$ ]]; then
            log "Evolution API responde en https://${DOMAIN}/ (HTTP ${code})"
            return 0
        fi
        sleep 3
    done
    warn "La API aún no responde por HTTPS — revisa: docker compose -f ${INSTALL_DIR}/docker-compose.yml logs -f api"
}

print_summary() {
    local api_key
    api_key="$(cat "${INSTALL_DIR}/.api-key" 2>/dev/null || echo '?')"
    cat <<EOF

════════════════════════════════════════════════════════════
  Evolution API instalada
════════════════════════════════════════════════════════════
  URL:      https://${DOMAIN}
  API Key:  ${api_key}
  Carpeta:  ${INSTALL_DIR}

  Probar:
    curl -sS -H "apikey: ${api_key}" "https://${DOMAIN}/"

  RNV Manager — actualiza el servicio:
    • Nombre: evoapi
    • Tipo:   evoapi (o api)
    • URL:    https://${DOMAIN}
    • VPS:    ronuimport.srl (533490)

  Si tenías «ai» (n8n) en ai.renace.tech:
    • Elimínalo o cámbialo a tipo evoapi si reutilizas ese dominio
    • Ejecuta escaneo VPS desde RNV → Servicios → Escanear

  Logs:
    cd ${INSTALL_DIR} && docker compose logs -f api
════════════════════════════════════════════════════════════
EOF
}

main() {
    require_root
    require_docker
    ensure_renacenet

    log "Dominio Evolution API: ${DOMAIN}"

    if detected="$(detect_n8n_domain 2>/dev/null || true)" && [[ -n "$detected" ]]; then
        warn "n8n detectado en Host(\`${detected}\`) — se instalará Evolution en ${DOMAIN}"
    fi

    if [[ "$REMOVE_N8N" -eq 1 ]]; then
        if [[ -n "$(find_n8n_containers)" ]]; then
            backup_n8n
            remove_n8n
        else
            warn "Sin contenedores n8n — solo despliegue Evolution API"
        fi
    fi

    if docker ps --format '{{.Names}}' | grep -qx 'evolution_api'; then
        warn "evolution_api ya corre — actualizando stack"
        if [[ ! -f "${INSTALL_DIR}/docker-compose.yml" ]]; then
            prepare_stack
        fi
        deploy_evolution
    else
        prepare_stack
        deploy_evolution
    fi

    print_summary
}

main "$@"
