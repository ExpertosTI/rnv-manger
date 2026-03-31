#!/bin/bash
# ===========================================
# RNV Manager - Deploy Script for VPS
# ===========================================
# Usage: ./deploy.sh [command]
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔═══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       RNV Manager - Deploy Tool       ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════╝${NC}"

# Load .env if exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from template...${NC}"
    cp env.template .env
    echo -e "${GREEN}✅ Created .env — edita los valores antes de continuar.${NC}"
    exit 1
fi

APP_PORT=${APP_PORT:-4200}

case "$1" in
    start)
        echo -e "${GREEN}🚀 Iniciando RNV Manager...${NC}"
        docker compose up -d --build
        echo ""
        echo -e "${GREEN}✅ RNV Manager corriendo en: http://localhost:${APP_PORT}${NC}"
        echo -e "${BLUE}   Logs: ./deploy.sh logs${NC}"
        ;;

    stop)
        echo -e "${YELLOW}⏹️  Deteniendo RNV Manager...${NC}"
        docker compose down
        echo -e "${GREEN}✅ Detenido.${NC}"
        ;;

    restart)
        echo -e "${YELLOW}🔄 Reiniciando RNV Manager...${NC}"
        docker compose down
        docker compose up -d --build
        echo -e "${GREEN}✅ Reiniciado en: http://localhost:${APP_PORT}${NC}"
        ;;

    logs)
        echo -e "${GREEN}📋 Logs en vivo (Ctrl+C para salir)...${NC}"
        docker compose logs -f app
        ;;

    logs-all)
        echo -e "${GREEN}📋 Todos los logs (Ctrl+C para salir)...${NC}"
        docker compose logs -f
        ;;

    backup)
        echo -e "${GREEN}💾 Creando backup manual...${NC}"
        mkdir -p backups
        BACKUP_FILE="backups/manual_$(date +%Y%m%d_%H%M%S).dump"
        docker compose exec -T db pg_dump \
            -U ${DB_USER:-rnvadmin} \
            -Fc ${DB_NAME:-rnv_manager} > "$BACKUP_FILE"
        SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
        echo -e "${GREEN}✅ Backup creado: $BACKUP_FILE ($SIZE)${NC}"
        echo -e "${BLUE}   Últimos 5 backups:${NC}"
        ls -lht backups/*.dump 2>/dev/null | head -5 || echo "   (ninguno)"
        ;;

    restore)
        if [ -z "$2" ]; then
            echo -e "${RED}❌ Especifica el archivo: ./deploy.sh restore backups/archivo.dump${NC}"
            echo -e "${BLUE}   Backups disponibles:${NC}"
            ls -lht backups/*.dump 2>/dev/null | head -10 || echo "   (ninguno)"
            exit 1
        fi
        if [ ! -f "$2" ]; then
            echo -e "${RED}❌ Archivo no encontrado: $2${NC}"
            exit 1
        fi
        echo -e "${YELLOW}⚠️  Esto SOBREESCRIBIRÁ la base de datos actual!${NC}"
        read -p "¿Estás seguro? (y/N): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            echo -e "${GREEN}📥 Restaurando desde $2...${NC}"
            docker compose exec -T db pg_restore \
                -U ${DB_USER:-rnvadmin} \
                -d ${DB_NAME:-rnv_manager} \
                --clean --if-exists < "$2"
            echo -e "${GREEN}✅ Restauración completada.${NC}"
        else
            echo -e "${YELLOW}Cancelado.${NC}"
        fi
        ;;

    migrate)
        echo -e "${GREEN}🔄 Corriendo migraciones de base de datos...${NC}"
        docker compose exec app npx prisma migrate deploy --schema=/app/prisma/schema.prisma
        echo -e "${GREEN}✅ Migraciones aplicadas.${NC}"
        ;;

    push)
        echo -e "${GREEN}📦 Push del schema a la DB (development only)...${NC}"
        docker compose exec app npx prisma db push --schema=/app/prisma/schema.prisma
        echo -e "${GREEN}✅ Schema sincronizado.${NC}"
        ;;

    shell)
        echo -e "${GREEN}🐚 Abriendo shell en el contenedor app...${NC}"
        docker compose exec app sh
        ;;

    db)
        echo -e "${GREEN}🗄️  Abriendo PostgreSQL CLI...${NC}"
        docker compose exec db psql -U ${DB_USER:-rnvadmin} ${DB_NAME:-rnv_manager}
        ;;

    status)
        echo -e "${GREEN}📊 Estado de los contenedores:${NC}"
        docker compose ps
        echo ""
        echo -e "${GREEN}💾 Uso de disco:${NC}"
        du -sh backups/ 2>/dev/null || true
        ;;

    health)
        echo -e "${GREEN}🏥 Verificando salud de los servicios...${NC}"
        echo ""

        # Check app
        if curl -sf "http://localhost:${APP_PORT}/api/health" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✅ App:      http://localhost:${APP_PORT} — OK${NC}"
        else
            echo -e "  ${RED}❌ App:      http://localhost:${APP_PORT} — NO RESPONDE${NC}"
        fi

        # Check DB container
        if docker compose exec -T db pg_isready -U ${DB_USER:-rnvadmin} > /dev/null 2>&1; then
            echo -e "  ${GREEN}✅ Database: PostgreSQL — OK${NC}"
        else
            echo -e "  ${RED}❌ Database: PostgreSQL — NO DISPONIBLE${NC}"
        fi

        # Check containers
        echo ""
        docker compose ps
        ;;

    update)
        echo -e "${GREEN}⬆️  Actualizando RNV Manager...${NC}"

        # Pull from git if it's a repo
        if git rev-parse --git-dir > /dev/null 2>&1; then
            echo -e "${BLUE}📥 Descargando cambios de git...${NC}"
            git pull
        else
            echo -e "${YELLOW}⚠️  No es un repositorio git. Asegúrate de haber copiado los nuevos archivos.${NC}"
        fi

        # Backup before update
        echo -e "${BLUE}💾 Creando backup previo a la actualización...${NC}"
        mkdir -p backups
        docker compose exec -T db pg_dump \
            -U ${DB_USER:-rnvadmin} \
            -Fc ${DB_NAME:-rnv_manager} > "backups/pre_update_$(date +%Y%m%d_%H%M%S).dump" 2>/dev/null || true

        # Rebuild and restart
        echo -e "${BLUE}🔨 Reconstruyendo imagen...${NC}"
        docker compose up -d --build

        echo ""
        echo -e "${GREEN}✅ Actualización completada!${NC}"
        echo -e "   App en: http://localhost:${APP_PORT}"
        ;;

    clean)
        echo -e "${YELLOW}🧹 Limpiando imágenes Docker antiguas...${NC}"
        docker compose down
        docker image prune -f
        echo -e "${GREEN}✅ Limpieza completada.${NC}"
        ;;

    *)
        echo ""
        echo -e "${BLUE}Uso: ./deploy.sh [comando]${NC}"
        echo ""
        echo "  Principales:"
        echo -e "  ${GREEN}start${NC}       Iniciar RNV Manager (build + run)"
        echo -e "  ${GREEN}stop${NC}        Detener todos los contenedores"
        echo -e "  ${GREEN}restart${NC}     Detener y volver a iniciar con rebuild"
        echo -e "  ${GREEN}update${NC}      Backup + git pull + rebuild"
        echo -e "  ${GREEN}health${NC}      Verificar estado de todos los servicios"
        echo ""
        echo "  Logs:"
        echo -e "  ${CYAN}logs${NC}        Ver logs del app en vivo"
        echo -e "  ${CYAN}logs-all${NC}    Ver todos los logs (app + db + backup)"
        echo -e "  ${CYAN}status${NC}      Estado de los contenedores"
        echo ""
        echo "  Base de datos:"
        echo -e "  ${YELLOW}backup${NC}      Crear backup manual"
        echo -e "  ${YELLOW}restore${NC}     Restaurar desde backup"
        echo -e "  ${YELLOW}migrate${NC}     Correr migraciones (prisma migrate deploy)"
        echo -e "  ${YELLOW}push${NC}        Sync schema a DB (solo desarrollo)"
        echo -e "  ${YELLOW}db${NC}          Abrir consola PostgreSQL"
        echo ""
        echo "  Utilidades:"
        echo -e "  ${CYAN}shell${NC}       Shell dentro del contenedor app"
        echo -e "  ${CYAN}clean${NC}       Limpiar imágenes Docker antiguas"
        echo ""
        ;;
esac
