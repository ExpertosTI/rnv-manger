#!/bin/bash
################################################################################
# RENACE Odoo Deployment Automation System
# V4.4 PRODUCTION - BULLETPROOF EDITION
#
# Basado en: RENACE v4.3 + Correcciones de dependencias Odoo 19.0
#
# Desarrollado por: RENACE Technology
# Website: https://renace.tech
#
# CORRECCIONES V4.4:
# - Añadidos paquetes faltantes: idna, certifi, urllib3, six, zope.interface
# - NO instala nodejs/npm globalmente (evita conflictos)
# - Usa sassc de apt si está disponible
# - Gevent se instala desde wheel binario (sin compilar)
# - Mejor manejo de errores y reintentos
################################################################################

# --- Colores y Funciones de Ayuda ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

set -o pipefail

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[ADVERTENCIA]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

mask_password() {
    local pass="$1"
    local len=${#pass}
    if [ $len -le 4 ]; then echo "****"
    else echo "${pass:0:2}$(printf '*%.0s' $(seq 1 $((len-4))))${pass: -2}"; fi
}

show_progress() {
    local duration=$1
    local message=$2
    local elapsed=0
    local bar_length=40
    echo -ne "${BLUE}[RENACE]${NC} $message\n"
    while [ $elapsed -lt $duration ]; do
        local progress=$((elapsed * bar_length / duration))
        local percentage=$((elapsed * 100 / duration))
        printf "\r${GREEN}[RENACE]${NC} ["
        for ((i=0; i<bar_length; i++)); do
            if [ $i -lt $progress ]; then printf "#"
            elif [ $i -eq $progress ]; then printf ">"
            else printf "."; fi
        done
        printf "] %3d%%" $percentage
        sleep 1
        elapsed=$((elapsed + 1))
    done
    printf "\r${GREEN}[RENACE]${NC} ["
    for ((i=0; i<bar_length; i++)); do printf "#"; done
    printf "] 100%%\n"
}

show_spinner() {
    local pid=$1
    local message=$2
    local spin='|/-\\'
    local i=0
    echo -ne "${BLUE}[RENACE]${NC} $message "
    while kill -0 $pid 2>/dev/null; do
        i=$(( (i+1) % 4 ))
        printf "\r${BLUE}[RENACE]${NC} $message ${YELLOW}%c${NC}" "${spin:$i:1}"
        sleep 0.1
    done
    printf "\r${BLUE}[RENACE]${NC} $message ${GREEN}[OK]${NC}                     \n"
}

generate_superadmin_password() {
    local service_name="$1"
    local random_string=$(tr -dc 'a-zA-Z0-9' </dev/urandom | fold -w 16 | head -n 1)
    echo "${service_name}_${random_string}"
}

list_used_ports() {
    echo "Puertos en uso:"
    ss -tuln | awk 'NR>1 {print $5}' | awk -F':' '{print $NF}' | sort -n | uniq | head -20
}

check_user_exists() { id "$1" >/dev/null 2>&1; }
check_service_exists() { [ -f "/etc/systemd/system/$1.service" ] || [ -f "/etc/init.d/$1" ]; }

validate_name() {
    local name=$1
    local type=$2
    if [ -z "$name" ]; then error "El $type no puede estar vacío"; fi
    if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then error "El $type solo puede contener letras, números, guiones y guiones bajos"; fi
}

run_with_retries() {
    local max_attempts=${2:-3}
    local delay=${3:-5}
    local attempt=1
    local cmd=$1
    while [ $attempt -le $max_attempts ]; do
        if eval "$cmd"; then return 0; fi
        echo "Intento $attempt/$max_attempts fallido. Reintentando en ${delay}s..."
        sleep $delay
        attempt=$(( attempt + 1 ))
        delay=$(( delay * 2 ))
    done
    return 1
}

start_and_verify_odoo_service() {
    local service_name=$1
    local user=$2
    local port=$3
    local log_file="/var/log/${user}/${service_name}.log"

    info "Iniciando servicio $service_name..."
    sudo systemctl start "$service_name"
    
    show_progress 15 "Esperando estabilización del servicio..."

    for i in {1..3}; do
        info "Verificando estado (Intento $i/3)..."
        if sudo systemctl is-active --quiet "$service_name"; then
            if ss -tuln | grep -q ":$port "; then
                info "¡Éxito! Servicio corriendo en puerto $port."
                return 0
            fi
        fi
        sleep 10
    done

    echo "--- DIAGNÓSTICO ---"
    sudo systemctl status "$service_name" -l --no-pager || true
    sudo journalctl -u "$service_name" --no-pager -n 50 || true
    if [ -f "$log_file" ]; then sudo tail -n 50 "$log_file" || true; fi
    return 1
}

#--------------------------------------------------
# SOLICITUD DE DATOS
#--------------------------------------------------

clear
echo -e "${GREEN}"
echo "============================================================="
echo "   RENACE Odoo Deployment System v4.4 BULLETPROOF"
echo "============================================================="
echo -e "${NC}"
echo -e "${BLUE}  Odoo 18.0 / 19.0 con todas las dependencias corregidas${NC}"
echo ""

read -p "Nombre del usuario Odoo [odoo]: " OE_USER
OE_USER=${OE_USER:-odoo}
validate_name "$OE_USER" "nombre de usuario"

if check_user_exists "$OE_USER"; then
    warn "El usuario $OE_USER ya existe."
    read -p "¿Continuar con este usuario? [y/N]: " USE_EXISTING
    if [[ ! "$USE_EXISTING" =~ ^[Yy]$ ]]; then exit 0; fi
fi

OE_HOME="/$OE_USER"
OE_HOME_EXT="/$OE_USER/${OE_USER}-server"
OE_VENV="$OE_HOME/venv"

read -p "Nombre del servicio [${OE_USER}-server]: " OE_CONFIG
OE_CONFIG=${OE_CONFIG:-${OE_USER}-server}
validate_name "$OE_CONFIG" "nombre de servicio"

if check_service_exists "$OE_CONFIG"; then
    warn "El servicio $OE_CONFIG ya existe."
    read -p "¿Sobrescribir? [y/N]: " OVERWRITE
    if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then exit 0; fi
    sudo systemctl stop "$OE_CONFIG" 2>/dev/null || true
fi

OE_SUPERADMIN=$(generate_superadmin_password "$OE_CONFIG")
echo "Contraseña master: $(mask_password "$OE_SUPERADMIN")"

echo "-----------------------------------------------------------"
list_used_ports
echo "-----------------------------------------------------------"

while true; do
    read -p "Puerto HTTP [8069]: " OE_PORT
    OE_PORT=${OE_PORT:-8069}
    if [[ "$OE_PORT" =~ ^[0-9]+$ ]]; then
        if ss -tuln | grep -w ":$OE_PORT" > /dev/null; then
            echo "Puerto $OE_PORT en uso."
        else break; fi
    else echo "Número inválido."; fi
done

LONGPOLLING_PORT=$((OE_PORT + 3))
while ss -tuln | grep -w ":$LONGPOLLING_PORT" > /dev/null; do
    LONGPOLLING_PORT=$((LONGPOLLING_PORT + 1))
done
info "Puerto Gevent: $LONGPOLLING_PORT"

read -p "¿Instalar wkhtmltopdf? [Y/n]: " INSTALL_WKHTMLTOPDF
[[ "$INSTALL_WKHTMLTOPDF" =~ ^[Nn]$ ]] && INSTALL_WKHTMLTOPDF="False" || INSTALL_WKHTMLTOPDF="True"

read -p "¿Configurar Nginx? [Y/n]: " INSTALL_NGINX
[[ "$INSTALL_NGINX" =~ ^[Nn]$ ]] && INSTALL_NGINX="False" || INSTALL_NGINX="True"

if [ "$INSTALL_NGINX" = "True" ]; then
    read -p "Subdominio (ej: odoo): " subdomain
    while [ -z "$subdomain" ]; do read -p "Requerido: " subdomain; done
    read -p "Dominio raíz (ej: renace.tech): " root_domain
    while [ -z "$root_domain" ]; do read -p "Requerido: " root_domain; done
    WEBSITE_NAME="${subdomain}.${root_domain}"
    
    read -p "¿Habilitar SSL? [y/N]: " ENABLE_SSL
    [[ "$ENABLE_SSL" =~ ^[Yy]$ ]] && ENABLE_SSL="True" || ENABLE_SSL="False"
    
    if [ "$ENABLE_SSL" = "True" ]; then
        read -p "Email para SSL: " ADMIN_EMAIL
        while [ -z "$ADMIN_EMAIL" ]; do read -p "Requerido: " ADMIN_EMAIL; done
    fi
else
    WEBSITE_NAME="_"
    ENABLE_SSL="False"
fi

echo "-----------------------------------------------------------"
echo "Versión de Odoo:"
echo "1) Odoo 18.0"
echo "2) Odoo 19.0 (Recomendado)"
read -p "Seleccione [2]: " VERSION_CHOICE
case "$VERSION_CHOICE" in
    1) OE_VERSION="18.0" ;;
    *) OE_VERSION="19.0" ;;
esac
OE_GIT_BRANCH="$OE_VERSION"
info "Versión: $OE_VERSION (rama: $OE_GIT_BRANCH)"

# Configuración
OE_GEVENT_VERSION="22.10.2"
INSTALL_POSTGRESQL_SIXTEEN="True"

echo "-----------------------------------------------------------"
echo "Resumen:"
echo "  Usuario: $OE_USER | Servicio: $OE_CONFIG"
echo "  Versión: $OE_VERSION | Puerto: $OE_PORT | Gevent: $LONGPOLLING_PORT"
echo "  Nginx: $INSTALL_NGINX | SSL: $ENABLE_SSL | Dominio: $WEBSITE_NAME"
echo "-----------------------------------------------------------"
read -p "¿Continuar? [S/n]: " confirm
if [[ "$confirm" =~ ^[Nn]$ ]]; then echo "Cancelado."; exit 1; fi

#--------------------------------------------------
# INSTALACIÓN
#--------------------------------------------------

info "Actualizando sistema..."
sudo apt-get update -y
sudo apt-get upgrade -y

# PostgreSQL
info "Instalando PostgreSQL 16..."
sudo curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg 2>/dev/null || true
echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt-get update -y
sudo apt-get install -y postgresql-16
sudo systemctl start postgresql
sudo systemctl enable postgresql
sudo su - postgres -c "createuser -s $OE_USER" 2>/dev/null || true

# Dependencias del sistema (SIN nodejs/npm para evitar conflictos)
info "Instalando dependencias del sistema..."
sudo apt-get install -y \
    python3 python3-pip python3-dev python3-venv python3-wheel python3-setuptools \
    build-essential wget git curl \
    libxml2-dev libxslt1-dev zlib1g-dev libsasl2-dev libldap2-dev \
    libssl-dev libffi-dev libpq-dev libjpeg-dev libpng-dev \
    liblcms2-dev libfreetype6-dev libxslt-dev libzip-dev \
    gdebi-core || warn "Algunas dependencias fallaron"

# SASS compiler (usar apt, no npm)
info "Verificando sassc..."
if ! command -v sassc >/dev/null 2>&1; then
    sudo apt-get install -y sassc || warn "sassc no instalado"
fi

# Wkhtmltopdf
if [ "$INSTALL_WKHTMLTOPDF" = "True" ]; then
    info "Instalando wkhtmltopdf..."
    sudo apt-get install -y wkhtmltopdf || warn "wkhtmltopdf no instalado"
fi

# Usuario
info "Configurando usuario $OE_USER..."
if ! check_user_exists "$OE_USER"; then
    sudo adduser --system --quiet --shell=/bin/bash --home=$OE_HOME --gecos 'ODOO' --group $OE_USER
    sudo adduser $OE_USER sudo 2>/dev/null || true
fi

sudo mkdir -p /var/log/$OE_USER
sudo chown $OE_USER:$OE_USER /var/log/$OE_USER

# Clonar Odoo
info "Clonando Odoo $OE_VERSION..."
if [ -d "$OE_HOME_EXT" ]; then
    warn "Directorio existe, actualizando..."
    sudo -u $OE_USER git -C $OE_HOME_EXT pull || true
else
    sudo git clone --depth 1 --branch $OE_GIT_BRANCH https://www.github.com/odoo/odoo $OE_HOME_EXT/
fi

sudo mkdir -p $OE_HOME/custom/addons
sudo chown -R $OE_USER:$OE_USER $OE_HOME

# Entorno virtual
info "Creando entorno virtual..."
if [ ! -d "$OE_VENV" ]; then
    sudo -u $OE_USER python3 -m venv $OE_VENV
fi
sudo -u $OE_USER $OE_VENV/bin/pip install --upgrade pip wheel setuptools

# Dependencias Python
info "Instalando dependencias Python..."
PIP_LOG="/var/log/${OE_USER}/pip_install.log"
sudo touch "$PIP_LOG"
sudo chown $OE_USER:$OE_USER "$PIP_LOG"

(
    # Cython<3 para evitar problemas de compilación
    sudo -u $OE_USER $OE_VENV/bin/pip install -q 'Cython<3'
    sudo -u $OE_USER $OE_VENV/bin/pip install -q 'setuptools<81'
    
    # Requirements sin gevent
    TMP_REQ="/tmp/odoo_requirements_nogevent.txt"
    curl -fsSL "https://github.com/odoo/odoo/raw/${OE_GIT_BRANCH}/requirements.txt" | sed '/^gevent/d' > "$TMP_REQ"
    sudo -u $OE_USER $OE_VENV/bin/pip install -q -r "$TMP_REQ" || true
    
    # Paquetes críticos CORREGIDOS (incluye todos los faltantes identificados)
    CRITICAL_PKGS=(
        "psycopg2-binary==2.9.9"
        "Babel" "passlib" "pytz" "markupsafe" "polib"
        "python-dateutil" "Jinja2" "psutil" "num2words"
        "rjsmin" "pyOpenSSL" "Pillow" "PyPDF2" "pypdf"
        "docutils" "vobject" "lxml_html_clean" "phonenumbers"
        "chardet" "python-stdnum" "pdfminer.six"
        # Paquetes que FALTABAN y causaban errores:
        "idna" "certifi" "charset_normalizer" "urllib3" "six"
    )
    
    for pkg in "${CRITICAL_PKGS[@]}"; do
        sudo -u $OE_USER $OE_VENV/bin/pip install -q "$pkg" || true
    done
    
    # Gevent desde wheel binario (evita compilación con Cython)
    sudo -u $OE_USER $OE_VENV/bin/pip install -q --only-binary=:all: "gevent==${OE_GEVENT_VERSION}" || \
        sudo -u $OE_USER $OE_VENV/bin/pip install -q "gevent==${OE_GEVENT_VERSION}" || true
    
    # Dependencias de gevent (zope)
    sudo -u $OE_USER $OE_VENV/bin/pip install -q --only-binary=:all: zope.event zope.interface || \
        sudo -u $OE_USER $OE_VENV/bin/pip install -q zope.event zope.interface || true

) >"$PIP_LOG" 2>&1 &
PID=$!
show_spinner $PID "Instalando paquetes Python"
wait $PID

sudo chown -R $OE_USER:$OE_USER $OE_HOME

# Configuración
info "Creando configuración..."
CPU_CORES=$(nproc)
WORKERS=$((CPU_CORES * 2 + 1))
[ $WORKERS -lt 2 ] && WORKERS=2
[ $WORKERS -gt 16 ] && WORKERS=16

sudo tee /etc/${OE_CONFIG}.conf > /dev/null <<EOF
[options]
admin_passwd = ${OE_SUPERADMIN}
list_db = True
http_port = ${OE_PORT}
longpolling_port = ${LONGPOLLING_PORT}
gevent_port = ${LONGPOLLING_PORT}
logfile = /var/log/${OE_USER}/${OE_CONFIG}.log
addons_path = ${OE_HOME_EXT}/addons,${OE_HOME}/custom/addons
db_user = ${OE_USER}
db_host = False
db_port = False
workers = ${WORKERS}
max_cron_threads = 2
limit_memory_soft = 2147483648
limit_memory_hard = 2684354560
limit_time_cpu = 600
limit_time_real = 1200
proxy_mode = True
EOF

sudo chown $OE_USER:$OE_USER /etc/${OE_CONFIG}.conf
sudo chmod 640 /etc/${OE_CONFIG}.conf

# Servicio systemd
info "Creando servicio systemd..."
sudo tee /etc/systemd/system/${OE_CONFIG}.service > /dev/null <<EOF
[Unit]
Description=Odoo $OE_VERSION - $OE_CONFIG (RENACE v4.4)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$OE_USER
Group=$OE_USER
ExecStart=$OE_VENV/bin/python3 $OE_HOME_EXT/odoo-bin -c /etc/${OE_CONFIG}.conf
StandardOutput=journal+console
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable $OE_CONFIG

# Nginx
if [ "$INSTALL_NGINX" = "True" ]; then
    info "Configurando Nginx..."
    sudo apt-get install -y nginx
    
    sudo tee /etc/nginx/sites-available/$WEBSITE_NAME > /dev/null <<EOF
server {
    listen 80;
    server_name $WEBSITE_NAME;
    
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Real-IP \$remote_addr;
    
    access_log /var/log/nginx/${OE_USER}-access.log;
    error_log /var/log/nginx/${OE_USER}-error.log;
    
    proxy_read_timeout 720s;
    proxy_connect_timeout 720s;
    proxy_send_timeout 720s;
    
    gzip on;
    gzip_types text/css text/plain application/json application/javascript;
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://127.0.0.1:$OE_PORT;
        proxy_redirect off;
    }
    
    location /longpolling {
        proxy_pass http://127.0.0.1:$LONGPOLLING_PORT;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
    
    location /websocket {
        proxy_pass http://127.0.0.1:$LONGPOLLING_PORT;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
    
    location ~* /web/static/ {
        proxy_cache_valid 200 60m;
        expires 864000;
        proxy_pass http://127.0.0.1:$OE_PORT;
    }
}
EOF
    
    sudo ln -sf /etc/nginx/sites-available/$WEBSITE_NAME /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    
    # SSL
    if [ "$ENABLE_SSL" = "True" ]; then
        info "Configurando SSL..."
        sudo apt-get install -y certbot python3-certbot-nginx
        sudo certbot --nginx -d $WEBSITE_NAME --noninteractive --agree-tos --email $ADMIN_EMAIL --redirect || \
            warn "SSL falló - puede configurarse manualmente después"
    fi
fi

# Arrancar servicio
sudo touch /var/log/${OE_USER}/${OE_CONFIG}.log
sudo chown $OE_USER:$OE_USER /var/log/${OE_USER}/${OE_CONFIG}.log

if start_and_verify_odoo_service "$OE_CONFIG" "$OE_USER" "$OE_PORT"; then
    echo ""
    echo -e "${GREEN}=============================================================${NC}"
    echo -e "${GREEN}   INSTALACIÓN COMPLETADA - RENACE v4.4 BULLETPROOF${NC}"
    echo -e "${GREEN}=============================================================${NC}"
    echo ""
    if [ "$INSTALL_NGINX" = "True" ] && [ "$ENABLE_SSL" = "True" ]; then
        echo "URL: https://$WEBSITE_NAME"
    elif [ "$INSTALL_NGINX" = "True" ]; then
        echo "URL: http://$WEBSITE_NAME"
    else
        echo "URL: http://IP_SERVIDOR:$OE_PORT"
    fi
    echo ""
    echo "Puerto HTTP: $OE_PORT"
    echo "Puerto Gevent: $LONGPOLLING_PORT"
    echo "Usuario: $OE_USER"
    echo "Servicio: $OE_CONFIG"
    echo "Config: /etc/${OE_CONFIG}.conf"
    echo "Logs: /var/log/$OE_USER/${OE_CONFIG}.log"
    echo ""
    echo -e "${RED}Contraseña Master: $OE_SUPERADMIN${NC}"
    echo ""
    echo "Comandos:"
    echo "  Iniciar:   sudo systemctl start $OE_CONFIG"
    echo "  Detener:   sudo systemctl stop $OE_CONFIG"
    echo "  Reiniciar: sudo systemctl restart $OE_CONFIG"
    echo "  Estado:    sudo systemctl status $OE_CONFIG"
    echo "  Logs:      sudo journalctl -u $OE_CONFIG -f"
    echo ""
    echo -e "${GREEN}Powered by RENACE Technology - renace.tech${NC}"
else
    echo ""
    error "La instalación falló. Revisa el diagnóstico arriba."
fi