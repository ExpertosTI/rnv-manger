#!/bin/bash
# ===========================================
# RNV Manager - Deploy Script for VPS
# ===========================================
# Usage: ./deploy.sh [start|stop|restart|logs|backup|restore]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       RNV Manager - Deploy Tool       ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from template...${NC}"
    cp env.template .env
    echo -e "${GREEN}✅ Created .env file. Please edit it with your settings.${NC}"
fi

case "$1" in
    start)
        echo -e "${GREEN}🚀 Starting RNV Manager...${NC}"
        docker compose up -d --build
        echo -e "${GREEN}✅ RNV Manager is running!${NC}"
        echo -e "   Access at: http://localhost:${APP_PORT:-4200}"
        ;;
    
    stop)
        echo -e "${YELLOW}⏹️  Stopping RNV Manager...${NC}"
        docker compose down
        echo -e "${GREEN}✅ Stopped.${NC}"
        ;;
    
    restart)
        echo -e "${YELLOW}🔄 Restarting RNV Manager...${NC}"
        docker compose restart
        echo -e "${GREEN}✅ Restarted.${NC}"
        ;;
    
    logs)
        echo -e "${GREEN}📋 Showing logs (Ctrl+C to exit)...${NC}"
        docker compose logs -f
        ;;
    
    backup)
        echo -e "${GREEN}💾 Creating manual backup...${NC}"
        mkdir -p backups
        docker compose exec -T db pg_dump -U ${DB_USER:-rnvadmin} -Fc ${DB_NAME:-rnv_manager} > backups/manual_$(date +%Y%m%d_%H%M%S).dump
        echo -e "${GREEN}✅ Backup created in ./backups/${NC}"
        ls -la backups/*.dump | tail -5
        ;;
    
    restore)
        if [ -z "$2" ]; then
            echo -e "${RED}❌ Please specify backup file: ./deploy.sh restore backups/filename.dump${NC}"
            exit 1
        fi
        echo -e "${YELLOW}⚠️  This will OVERWRITE the current database!${NC}"
        read -p "Are you sure? (y/N): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            echo -e "${GREEN}📥 Restoring from $2...${NC}"
            docker compose exec -T db pg_restore -U ${DB_USER:-rnvadmin} -d ${DB_NAME:-rnv_manager} --clean < "$2"
            echo -e "${GREEN}✅ Restore completed.${NC}"
        else
            echo -e "${YELLOW}Cancelled.${NC}"
        fi
        ;;
    
    migrate)
        echo -e "${GREEN}🔄 Running database migrations...${NC}"
        docker compose exec app npx prisma db push
        echo -e "${GREEN}✅ Migrations applied.${NC}"
        ;;
    
    shell)
        echo -e "${GREEN}🐚 Opening shell in app container...${NC}"
        docker compose exec app sh
        ;;
    
    db)
        echo -e "${GREEN}🗄️  Opening PostgreSQL CLI...${NC}"
        docker compose exec db psql -U ${DB_USER:-rnvadmin} ${DB_NAME:-rnv_manager}
        ;;
    
    status)
        echo -e "${GREEN}📊 Container Status:${NC}"
        docker compose ps
        ;;
    
    update)
        echo -e "${GREEN}⬆️  Updating RNV Manager...${NC}"
        git pull
        docker compose up -d --build
        docker compose exec app npx prisma db push
        echo -e "${GREEN}✅ Update completed.${NC}"
        ;;
    
    *)
        echo "Usage: ./deploy.sh [command]"
        echo ""
        echo "Commands:"
        echo "  start    - Start RNV Manager"
        echo "  stop     - Stop all containers"
        echo "  restart  - Restart all containers"
        echo "  logs     - View live logs"
        echo "  backup   - Create manual database backup"
        echo "  restore  - Restore from backup file"
        echo "  migrate  - Run database migrations"
        echo "  shell    - Open shell in app container"
        echo "  db       - Open PostgreSQL CLI"
        echo "  status   - Show container status"
        echo "  update   - Pull changes and rebuild"
        ;;
esac
