# RNV Manager — Despliegue en producción

Stack en **Docker Swarm** con **Traefik** (`RenaceNet`). Un solo comando en el servidor.

## Requisitos del servidor

- Docker CE + compose plugin
- Swarm activo (`docker swarm init` — lo hace `deploy.sh` si falta)
- Red overlay externa `RenaceNet` (Traefik)
- Repo en `/opt/rnv-manager`
- Variables en `/etc/rnv-manager/rnv.env`

## Primera vez / variables

El archivo canónico de producción es:

```bash
/etc/rnv-manager/rnv.env
```

Variables **obligatorias**:

| Variable | Descripción |
|---|---|
| `DB_USER` | Usuario PostgreSQL (`rnvadmin`) |
| `DB_PASSWORD` | Contraseña real del volumen PG |
| `DB_NAME` | `rnv_manager` |
| `JWT_SECRET` | Secreto JWT (≥32 chars). Legacy: `SESSION_SECRET` se mapea solo |
| `DATABASE_URL` | `postgresql://USER:PASS@db:5432/rnv_manager?sslmode=disable` |

Opcionales (integraciones): `SMTP_*`, `ODOO_*`, `HOSTINGER_API_TOKEN`, `GEMINI_API_KEY`, `MASTER_PASSWORD`.

Plantilla local: `env.template` → copiar a `.env` para desarrollo.

## Desplegar (un comando)

```bash
cd /opt/rnv-manager
git fetch origin && git reset --hard origin/main
./deploy.sh update
```

`update` hace automáticamente:

1. `git reset --hard origin/main`
2. Carga `/etc/rnv-manager/rnv.env` + `.env`
3. Backup DB (si está corriendo)
4. `docker compose build` (app + go-api)
5. `docker stack deploy` (nunca `compose up` en producción)
6. Espera `1/1` en db, go-api, app
7. `curl https://rnv.renace.tech/api/health`

Sin pull de git:

```bash
./deploy.sh start
```

## Arquitectura

```
Internet → Traefik (RenaceNet) → app:3000 (Next.js)
                                      ↓ proxy /api/*
                                   go-api:8080 (solo red interna rnv_net)
                                      ↓
                                   db:5432 (PostgreSQL)
```

- **No** exponer go-api en Traefik; Next.js reescribe `/api/*` → `http://go-api:8080`.
- go-api espera a PostgreSQL (`nc -z db 5432`) antes de arrancar.

## Comandos útiles

```bash
./deploy.sh status      # réplicas Swarm
./deploy.sh health      # comprueba API pública
./deploy.sh logs-api    # logs Go API
./deploy.sh logs        # logs Next.js
./deploy.sh backup      # dump manual
./deploy.sh restart     # reinicio sin rebuild
./deploy.sh stop        # baja stack (conserva volumen DB)
```

## Desarrollo local (sin Swarm)

```bash
cp env.template .env
docker compose up -d --build
# UI: http://localhost:3000
```

## Solución de problemas

| Síntoma | Causa | Acción |
|---|---|---|
| Login “Error de conexión” | go-api no en `1/1` | `./deploy.sh logs-api` |
| `404` en `/api/*` | Stack sin go-api o sin rebuild app | `./deploy.sh update` |
| `RenaceNet not attachable` | Usaste `compose up` en prod | Solo `./deploy.sh update` |
| OTP no envía email | `SMTP_PASS` vacío | Completar en `.env` / Ajustes |

Tras deploy fallido:

```bash
docker service ps rnv-manager_go-api --no-trunc
./deploy.sh logs-api
```
