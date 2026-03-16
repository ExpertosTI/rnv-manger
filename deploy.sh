#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="rnv-manager"
GITHUB_REPO="${GITHUB_REPO:-ExpertosTI/rnv-manger}"
GITHUB_REF="${GITHUB_REF:-deploy/rnv-manager}"
WORKDIR="/opt/rnv-manager"
ENV_FILE="/etc/rnv-manager/rnv.env"
NETWORK_PUBLIC="RenaceNet"
NETWORK_INTERNAL="rnv_internal"
APP_DOMAIN="${APP_DOMAIN:-rnv.renace.tech}"

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

get_service_env() {
    docker service inspect "${STACK_NAME}_db" --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' 2>/dev/null || true
}

get_env_value() {
    echo "$1" | awk -F= -v key="$2" '$1==key{print substr($0,index($0,"=")+1); exit}'
}

ensure_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        run_as_root mkdir -p "$(dirname "$ENV_FILE")"
        cat <<EOF | run_as_root tee "$ENV_FILE" >/dev/null
DB_USER=
DB_PASSWORD=
DB_NAME=
APP_PORT=3000
MASTER_PASSWORD=${MASTER_PASSWORD:-JustWork2027@}
MAESTRO_PIN=${MAESTRO_PIN:-101284}
SESSION_SECRET=
HOSTINGER_API_TOKEN=
ODOO_URL=
ODOO_DB=
ODOO_USERNAME=
ODOO_API_KEY=
GEMINI_API_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EOF
        run_as_root chmod 600 "$ENV_FILE"
    fi
}

set_env_value() {
    key="$1"
    value="$2"
    if grep -q "^${key}=" "$ENV_FILE"; then
        run_as_root sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
        echo "${key}=${value}" | run_as_root tee -a "$ENV_FILE" >/dev/null
    fi
}

sync_db_credentials() {
    db_container=""
    attempts=0
    while [ $attempts -lt 30 ]; do
        db_container="$(docker ps --filter "name=${STACK_NAME}_db" --format "{{.ID}}" | head -n 1)"
        if [ -n "$db_container" ]; then
            if run_as_root docker exec -u postgres -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$db_container" psql -U "$DB_ADMIN_USER" -d postgres -c "select 1" >/dev/null 2>&1; then
                break
            fi
        fi
        attempts=$((attempts+1))
        sleep 2
    done
    if [ -n "$db_container" ]; then
        db_user_lit="$(printf "%s" "$DB_USER" | sed "s/'/''/g")"
        db_pass_lit="$(printf "%s" "$DB_PASSWORD" | sed "s/'/''/g")"
        db_name_lit="$(printf "%s" "$DB_NAME" | sed "s/'/''/g")"
        db_user_ident="$(printf "%s" "$DB_USER" | sed "s/\"/\"\"/g")"
        db_name_ident="$(printf "%s" "$DB_NAME" | sed "s/\"/\"\"/g")"
        role_exists="$(run_as_root docker exec -u postgres -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$db_container" psql -U "$DB_ADMIN_USER" -d postgres -tAc "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '${db_user_lit}'" 2>/dev/null | head -n 1)"
        if [ "$role_exists" = "1" ]; then
            run_as_root docker exec -u postgres -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$db_container" psql -U "$DB_ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE \"${db_user_ident}\" WITH PASSWORD '${db_pass_lit}';" >/dev/null
        else
            run_as_root docker exec -u postgres -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$db_container" psql -U "$DB_ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE \"${db_user_ident}\" LOGIN PASSWORD '${db_pass_lit}';" >/dev/null
        fi
        db_exists="$(run_as_root docker exec -u postgres -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$db_container" psql -U "$DB_ADMIN_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${db_name_lit}'" 2>/dev/null | head -n 1)"
        if [ "$db_exists" = "1" ]; then
            run_as_root docker exec -u postgres -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$db_container" psql -U "$DB_ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"${db_name_ident}\" OWNER TO \"${db_user_ident}\";" >/dev/null || true
            run_as_root docker exec -u postgres -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$db_container" psql -U "$DB_ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE \"${db_name_ident}\" TO \"${db_user_ident}\";" >/dev/null || true
        fi
    fi
}

sync_db_schema() {
    db_container=""
    attempts=0
    while [ $attempts -lt 30 ]; do
        db_container="$(docker ps --filter "name=${STACK_NAME}_db" --format "{{.ID}}" | head -n 1)"
        if [ -n "$db_container" ]; then
            if run_as_root docker exec -u postgres -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$db_container" psql -U "$DB_ADMIN_USER" -d postgres -c "select 1" >/dev/null 2>&1; then
                break
            fi
        fi
        attempts=$((attempts+1))
        sleep 2
    done
    if [ -z "$db_container" ]; then
        return
    fi
    db_name_lit="$(printf "%s" "$DB_NAME" | sed "s/'/''/g")"
    db_exists="$(run_as_root docker exec -u postgres -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$db_container" psql -U "$DB_ADMIN_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${db_name_lit}'" 2>/dev/null | head -n 1)"
    if [ "$db_exists" != "1" ]; then
        return
    fi
    run_as_root docker exec -u postgres -e PGPASSWORD="$DB_ADMIN_PASSWORD" "$db_container" psql -U "$DB_ADMIN_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "odooPartnerId" INTEGER;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "odooLastSync" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "odooData" JSONB;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "totalMonthlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "VPS" ADD COLUMN IF NOT EXISTS "monthlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "VPS" ADD COLUMN IF NOT EXISTS "configFiles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "resourceUsage" JSONB;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "monthlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Service_clientId_fkey'
    ) THEN
        ALTER TABLE "Service"
        ADD CONSTRAINT "Service_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "odooInvoiceId" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "odooInvoiceName" TEXT;

CREATE TABLE IF NOT EXISTS "RevenueHistory" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clients" INTEGER NOT NULL DEFAULT 0,
    "vps" INTEGER NOT NULL DEFAULT 0,
    "services" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RevenueHistory_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'RevenueHistory_year_month_key'
    ) THEN
        ALTER TABLE "RevenueHistory"
        ADD CONSTRAINT "RevenueHistory_year_month_key" UNIQUE ("year", "month");
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AppSettings_key_key'
    ) THEN
        ALTER TABLE "AppSettings"
        ADD CONSTRAINT "AppSettings_key_key" UNIQUE ("key");
    END IF;
END $$;
SQL
}

require_command docker
require_command openssl
require_command curl
require_command tar

if ! docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -qi active; then
    run_as_root docker swarm init
fi

if ! docker network inspect "$NETWORK_PUBLIC" >/dev/null 2>&1; then
    run_as_root docker network create --driver overlay --attachable "$NETWORK_PUBLIC"
fi

if ! docker network inspect "$NETWORK_INTERNAL" >/dev/null 2>&1; then
    run_as_root docker network create --driver overlay --attachable "$NETWORK_INTERNAL"
fi

ARCHIVE_URL="https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_REF}.tar.gz"
mkdir -p "$(dirname "$WORKDIR")"
run_as_root mkdir -p "$WORKDIR"

# Check if current directory is a valid project source
if [ -f "./deploy/stack.yml" ]; then
    echo "Usando directorio actual como fuente..."
    PROJECT_DIR="$(pwd)"
else
    # Intentar descargar tarball (rapido, funciona si es publico)
    # Preferimos GIT si está disponible para evitar caché vieja de tarballs
    USE_TARBALL=1
    if command -v git >/dev/null 2>&1; then
         USE_TARBALL=0
    fi
    
    if [ "$USE_TARBALL" -eq 1 ] && curl -fIm 5 "$ARCHIVE_URL" >/dev/null 2>&1; then
        echo "Descargando codigo via tarball: ${ARCHIVE_URL}"
    TMP_DIR="$(mktemp -d)"
    # shellcheck disable=SC2064
    trap "rm -rf '$TMP_DIR'" EXIT
    
    if curl -fsSL "$ARCHIVE_URL" -o "${TMP_DIR}/src.tgz"; then
        run_as_root rm -rf "${WORKDIR}/src"
        run_as_root mkdir -p "${WORKDIR}/src"
        run_as_root tar -xzf "${TMP_DIR}/src.tgz" -C "${WORKDIR}/src" --strip-components=1
        PROJECT_DIR="${WORKDIR}/src"
    else
        echo "Error descargando tarball"
        exit 1
    fi
else
    echo "Repositorio privado o tarball no accesible. Usando git clone..."
    require_command git
    
    # Si ya existe .git, usamos git pull
    if [ -d "$WORKDIR/.git" ]; then
        echo "Actualizando repositorio existente..."
        git -C "$WORKDIR" fetch origin
        git -C "$WORKDIR" checkout "$GITHUB_REF"
        git -C "$WORKDIR" pull origin "$GITHUB_REF"
        PROJECT_DIR="$WORKDIR"
    else
        # Clonado limpio
        echo "Clonando repositorio..."
        # Intentar HTTPS primero, luego SSH si falla (aunque git clone suele manejar esto si se configura url)
        # Pero aqui asumimos que el usuario proveera la URL correcta si falla el default
        # Default a HTTPS para publico, pero si es privado pedira pass.
        # Si el usuario tiene SSH configurado, deberia usar URL SSH.
        # Vamos a intentar clonar con la URL construida.
        GIT_URL="https://github.com/${GITHUB_REPO}.git"
        SSH_URL="git@github.com:${GITHUB_REPO}.git"
        
        # Si existe llave SSH default, intentamos SSH primero para evitar prompt de HTTPS
        USE_SSH=0
        if [ -f "$HOME/.ssh/id_rsa" ] || [ -f "$HOME/.ssh/id_ed25519" ]; then
             echo "Detectadas llaves SSH, intentando usar SSH..."
             USE_SSH=1
        fi

        if [ "$USE_SSH" -eq 1 ]; then
             if ! git clone --branch "${GITHUB_REF##*/}" "$SSH_URL" "$WORKDIR"; then
                 echo "Fallo clonado SSH. Intentando HTTPS..."
                 git clone --branch "${GITHUB_REF##*/}" "$GIT_URL" "$WORKDIR"
             fi
        else
             if ! git clone --branch "${GITHUB_REF##*/}" "$GIT_URL" "$WORKDIR"; then
                 echo "Fallo clonado HTTPS. Intentando SSH..."
                 git clone --branch "${GITHUB_REF##*/}" "$SSH_URL" "$WORKDIR"
             fi
        fi
        PROJECT_DIR="$WORKDIR"
    fi
fi
fi

STACK_FILE="${PROJECT_DIR}/deploy/stack.yml"

if [ ! -f "$STACK_FILE" ]; then
    echo "No se encontro stack.yml en ${STACK_FILE}"
    exit 1
fi

service_env="$(get_service_env)"
service_db_user="$(get_env_value "$service_env" "POSTGRES_USER")"
service_db_password="$(get_env_value "$service_env" "POSTGRES_PASSWORD")"
service_db_name="$(get_env_value "$service_env" "POSTGRES_DB")"

ensure_env_file

if [ -n "$service_db_user" ]; then
    set_env_value "DB_USER" "$service_db_user"
fi
if [ -n "$service_db_password" ]; then
    set_env_value "DB_PASSWORD" "$service_db_password"
fi
if [ -n "$service_db_name" ]; then
    set_env_value "DB_NAME" "$service_db_name"
fi

if [ -z "${SESSION_SECRET:-}" ]; then
    if ! grep -q "^SESSION_SECRET=" "$ENV_FILE" || [ -z "$(get_env_value "$(cat "$ENV_FILE")" "SESSION_SECRET")" ]; then
        set_env_value "SESSION_SECRET" "$(generate_secret)"
    fi
fi

set -a
. "$ENV_FILE"
set +a

DB_ADMIN_USER="${service_db_user:-$DB_USER}"
DB_ADMIN_PASSWORD="${service_db_password:-$DB_PASSWORD}"

required_vars=(
    DB_USER
    DB_PASSWORD
    DB_NAME
    APP_PORT
    MASTER_PASSWORD
    MAESTRO_PIN
    SESSION_SECRET
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

run_as_root sed -i "s|rnv\.renace\.tech|${APP_DOMAIN}|g" "$STACK_FILE"

if ! grep -q "${APP_DOMAIN}" "$STACK_FILE"; then
    echo "No se pudo aplicar APP_DOMAIN en stack.yml"
    exit 1
fi

# Build Main App
echo "Construyendo imagen principal..."
run_as_root docker build -t rnv-manager:latest "$PROJECT_DIR"

# Build Upgrader Services
if [ -d "$PROJECT_DIR/upgrader" ]; then
    echo "Construyendo servicios Upgrader..."
    run_as_root docker build -t rnv-upgrader-backend:latest "$PROJECT_DIR/upgrader/backend"
    run_as_root docker build -t rnv-upgrader-frontend:latest "$PROJECT_DIR/upgrader/frontend"
fi

run_as_root docker stack deploy -c "$STACK_FILE" "$STACK_NAME"
sync_db_credentials
sync_db_schema
run_as_root docker service ls --filter "name=${STACK_NAME}_"
echo "Deploy completado: https://${APP_DOMAIN}"
echo "Upgrader disponible en: https://${APP_DOMAIN}/upgrader"
echo "Variables guardadas en ${ENV_FILE}"
