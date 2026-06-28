# RNV Manager

Panel de control de infraestructura (VPS, clientes, Odoo, facturación) — **Next.js + Go API + PostgreSQL**.

## Desarrollo local

```bash
cp env.template .env
npm install
npm run dev          # UI en http://localhost:3000
# Go API (terminal aparte):
cd rnv-go-api && go run .
```

Con Docker:

```bash
cp env.template .env
docker compose up -d --build
```

## Producción (VPS RenaceTech)

Ver **[DEPLOY.md](./DEPLOY.md)** — un solo comando:

```bash
cd /opt/rnv-manager && ./deploy.sh update
```

Variables en `/etc/rnv-manager/rnv.env`. URL: https://rnv.renace.tech

## Estructura

| Ruta | Descripción |
|---|---|
| `src/` | Frontend Next.js |
| `rnv-go-api/` | Backend Go (Gin, GORM, Gemini, Odoo) |
| `docker-compose.yml` | Stack Swarm (db, go-api, app, backup) |
| `deploy.sh` | Deploy automatizado producción |
| `env.template` | Plantilla de variables |
