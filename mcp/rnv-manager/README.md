# RNV Manager MCP

Servidor MCP (stdio) para que Cursor liste/asigne/complete tareas y consulte
clientes, VPS, servicios, billing y topología vía la API de RNV Manager.

## Requisitos

- Node 18+
- Service token `admin` con prefijo `rnv_` (superadmin en la app)

## Crear token

1. Entra a https://rnv.renace.tech como superadmin.
2. Crea un **service token** (API / Ajustes) con rol `admin`.
3. Copia el valor `rnv_…` (solo se muestra una vez).

O vía API (sesión cookie/JWT de superadmin):

```bash
curl -X POST https://rnv.renace.tech/api/auth/service-tokens \
  -H "Authorization: Bearer <tu-jwt-o-cookie>" \
  -H "Content-Type: application/json" \
  -d '{"name":"cursor-mcp","role":"admin"}'
```

## Instalar

```bash
cd mcp/rnv-manager
npm install
```

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `RNV_API_URL` | `https://rnv.renace.tech` | Base de la app (sin `/api`) |
| `RNV_API_TOKEN` | — | Service token `rnv_…` (**obligatorio**) |

```bash
export RNV_API_TOKEN='rnv_....'
export RNV_API_URL='https://rnv.renace.tech'   # opcional
```

## Cursor

El repo incluye la entrada en [`.cursor/mcp.json`](../../.cursor/mcp.json):

```json
"rnv-manager": {
  "command": "npx",
  "args": ["-y", "tsx", "${workspaceFolder}/mcp/rnv-manager/src/index.ts"],
  "env": {
    "RNV_API_URL": "https://rnv.renace.tech",
    "RNV_API_TOKEN": "${env:RNV_API_TOKEN}"
  }
}
```

1. Define `RNV_API_TOKEN` en el entorno del sistema o pégalo en Cursor → MCP → env.
2. `npm install` dentro de `mcp/rnv-manager`.
3. Reinicia MCP / Cursor.
4. Prueba: «lista las tareas pending de Mi Flujo» → tool `rnv_list_tasks`.

## Tools

| Tool | Uso |
|------|-----|
| `rnv_list_tasks` | Listar (filtros status/type/serviceId) |
| `rnv_create_task` | Asignar (`type=work` por defecto) |
| `rnv_complete_task` | Marcar hecha |
| `rnv_cancel_task` | Cancelar |
| `rnv_list_clients` / `rnv_get_client` | Clientes |
| `rnv_list_vps` / `rnv_get_vps` | VPS |
| `rnv_list_services` / `rnv_get_service` | Servicios |
| `rnv_list_offline` | Servicios caídos |
| `rnv_billing_summary` / `rnv_billing_overdue` | Facturación |
| `rnv_billing_remind` | Recordatorio mora por email |
| `rnv_topology` | Mapa / clusters |
| `rnv_stats` | Dashboard |
| `rnv_search` | Búsqueda en clients+vps+services |

## Inspector (opcional)

```bash
cd mcp/rnv-manager
RNV_API_TOKEN=rnv_… npm run inspect
```

## Seguridad

- No subas `RNV_API_TOKEN` al git.
- El MCP no expone vault/SSH/credenciales.
- Corre en tu máquina; no despliega un MCP HTTP en el VPS.
