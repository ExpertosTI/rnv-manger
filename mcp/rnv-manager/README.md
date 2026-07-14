# RNV Manager MCP

Servidor MCP (stdio) para que Cursor liste/asigne/complete tareas y consulte
clientes, VPS, servicios, billing y topología vía la API de RNV Manager.

## Archivo fácil (recomendado)

Todo vive en un solo archivo:

```
mcp/rnv-manager/.env
```

Plantilla: [`env.example`](./env.example). En este repo ya existe `.env` listo para pegar el token.

### Pasos

1. Instala deps: `cd mcp/rnv-manager && npm install`
2. En https://rnv.renace.tech/settings → sección **Cursor MCP** → **Crear token admin**
3. Copia el `rnv_…` y pégalo en `.env`:

```env
RNV_API_URL=https://rnv.renace.tech
RNV_API_TOKEN=rnv_pegá_el_token_aquí
```

4. Cursor → Settings → MCP → reinicia `rnv-manager`
5. Pregunta en el chat: «dime qué tareas tengo»

El servidor lee `.env` solo; no hace falta `export` en la terminal.

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
npm run inspect
```

## Seguridad

- `.env` está en `.gitignore` — no lo subas a git.
- El MCP no expone vault/SSH.
- Corre en tu Mac; no es un servicio en el VPS.
