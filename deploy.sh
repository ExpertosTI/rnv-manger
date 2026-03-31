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
        echo -e "${YELLOW}🔄 Reiniciando todo el stack...${NC}"
        docker compose restart
        echo -e "${GREEN}✅ Reiniciado.${NC}"
        ;;

    rebuild-app)
        echo -e "${YELLOW}🔄 Reconstruyendo y reiniciando solo la App...${NC}"
        docker compose up -d --build app
        echo -e "${GREEN}✅ App reconstruida.${NC}"
        ;;

    logs)
        echo -e "${GREEN}📋 Logs de la App (Ctrl+C para salir)...${NC}"
        docker compose logs -f app
        ;;

    logs-db)
        echo -e "${GREEN}📋 Logs de la Base de Datos (Ctrl+C para salir)...${NC}"
        docker compose logs -f db
        ;;

    logs-backup)
        echo -e "${GREEN}📋 Logs del servicio de Backup (Ctrl+C para salir)...${NC}"
        docker compose logs -f backup
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
        echo -e "${GREEN}⬆️  Actualizando RNV Manager (Solo App)...${NC}"

        # Pull from git if it's a repo
        if git rev-parse --git-dir > /dev/null 2>&1; then
            echo -e "${BLUE}📥 Descargando cambios de git...${NC}"
            git pull
        else
            echo -e "${YELLOW}⚠️  No es un repositorio git. Asegúrate de haber copiado los nuevos archivos.${NC}"
        fi

        # Backup before update
        echo -e "${BLUE}💾 Creando backup de seguridad previo a la actualización...${NC}"
        mkdir -p backups
        docker compose exec -T db pg_dump \
            -U ${DB_USER:-rnvadmin} \
            -Fc ${DB_NAME:-rnv_manager} > "backups/pre_update_$(date +%Y%m%d_%H%M%S).dump" 2>/dev/null || true

        # Rebuild and restart ONLY app
        echo -e "${BLUE}🔨 Reconstruyendo y reiniciando contenedor 'app'...${NC}"
        docker compose up -d --build app

        # Wait a bit and show migration status
        echo -e "${BLUE}🔄 Verificando migraciones de base de datos...${NC}"
        sleep 5
        if docker compose logs --tail=50 app | grep -iE "migration|prisma"; then
            echo -e "${GREEN}✅ Proceso de migración detectado en los logs.${NC}"
        else
            echo -e "${YELLOW}ℹ️ Revisa los logs para confirmar las migraciones: ./deploy.sh logs${NC}"
        fi

        echo ""
        echo -e "${GREEN}✅ Actualización de App completada!${NC}"
        echo -e "   App en: http://localhost:${APP_PORT}"
        ;;

    update-all)
        echo -e "${GREEN}⬆️  Actualizando TODO el stack (App + DB)...${NC}"
        git pull || true
        docker compose up -d --build
        echo -e "${GREEN}✅ Actualización total completada.${NC}"
        ;;

    clean)
        echo -e "${YELLOW}🧹 Limpiando imágenes Docker antiguas...${NC}"
        docker image prune -f
        echo -e "${GREEN}✅ Limpieza de imágenes completada.${NC}"
        ;;

    prune)
        echo -e "${YELLOW}🧹 Limpieza profunda de Docker (imágenes y volúmenes huérfanos)...${NC}"
        docker system prune -a --volumes -f
        echo -e "${GREEN}✅ Limpieza total completada.${NC}"
        ;;

    *)
        echo ""
        echo -e "${BLUE}Uso: ./deploy.sh [comando]${NC}"
        echo ""
        echo "  Principales:"
        echo -e "  ${GREEN}start${NC}       Iniciar RNV Manager (build + run)"
        echo -e "  ${GREEN}stop${NC}        Detener todos los contenedores"
        echo -e "  ${GREEN}restart${NC}     Reiniciar servicios actuales (sin rebuild)"
        echo -e "  ${GREEN}update${NC}      Git pull + Backup + Rebuild App (Recomendado)"
        echo -e "  ${GREEN}update-all${NC}  Git pull + Rebuild todo el stack"
        echo -e "  ${GREEN}health${NC}      Verificar estado de todos los servicios"
        echo ""
        echo "  Logs:"
        echo -e "  ${CYAN}logs${NC}        Logs de la app (Next.js)"
        echo -e "  ${CYAN}logs-db${NC}     Logs de la base de datos"
        echo -e "  ${CYAN}logs-backup${NC} Logs del servicio de backup"
        echo -e "  ${CYAN}logs-all${NC}    Todos los logs combinados"
        echo -e "  ${CYAN}status${NC}      Estado de los contenedores"
        echo ""
        echo "  Mantenimiento:"
        echo -e "  ${YELLOW}backup${NC}      Crear backup manual"
        echo -e "  ${YELLOW}restore${NC}     Restaurar desde backup"
        echo -e "  ${YELLOW}migrate${NC}     Correr migraciones manualmente"
        echo -e "  ${YELLOW}rebuild-app${NC} Reconstruir solo la app"
        echo -e "  ${YELLOW}clean${NC}       Borrar imágenes 'dangling'"
        echo -e "  ${YELLOW}prune${NC}       Borrar TODO lo que no esté en uso"
        echo ""
        echo "  Utilidades:"
        echo -e "  ${CYAN}shell${NC}       Shell dentro del contenedor app"
        echo -e "  ${CYAN}db${NC}          Consola PostgreSQL"
        echo ""
        ;;
esac
