import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createClient,
  errResult,
  jsonResult,
  qs,
  rnvFetch,
  type RnvClient,
} from "./client.js";

function getClient(): RnvClient {
  return createClient();
}

type ListItem = Record<string, unknown>;

function asArray(data: unknown): ListItem[] {
  if (Array.isArray(data)) return data as ListItem[];
  if (data && typeof data === "object" && "data" in data) {
    const inner = (data as { data: unknown }).data;
    if (Array.isArray(inner)) return inner as ListItem[];
  }
  return [];
}

function matchesQuery(item: ListItem, q: string): boolean {
  const hay = JSON.stringify(item).toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "rnv_list_tasks",
    {
      description:
        "Lista tareas de Mi Flujo / calendario (ScheduledTask). Filtra por status (pending|done|cancelled) y type (work|reminder|billing|…).",
      inputSchema: {
        status: z.string().optional().describe("pending | done | cancelled"),
        type: z
          .string()
          .optional()
          .describe("work = Mi Flujo; reminder, billing, etc."),
        serviceId: z.string().optional().describe("Filtrar por servicio"),
      },
    },
    async ({ status, type, serviceId }) => {
      try {
        const c = getClient();
        const data = await rnvFetch(
          c,
          `/calendar/tasks${qs({ status, type, serviceId })}`
        );
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_create_task",
    {
      description:
        "Crea/asigna una tarea. type=work para Mi Flujo. scheduledAt en ISO8601. Opcional serviceId/clientId.",
      inputSchema: {
        title: z.string().describe("Título de la tarea"),
        scheduledAt: z
          .string()
          .describe("Fecha/hora ISO8601, ej. 2026-07-15T10:00:00Z"),
        type: z
          .string()
          .optional()
          .describe("Default work (Mi Flujo). También: reminder, billing, custom"),
        description: z.string().optional(),
        serviceId: z.string().optional(),
        clientId: z.string().optional(),
        notifyEmail: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        const c = getClient();
        const body = {
          title: args.title,
          scheduledAt: args.scheduledAt,
          type: args.type || "work",
          description: args.description,
          serviceId: args.serviceId,
          clientId: args.clientId,
          notifyEmail: args.notifyEmail ?? false,
          status: "pending",
        };
        const data = await rnvFetch(c, "/calendar/tasks", {
          method: "POST",
          body: JSON.stringify(body),
        });
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_complete_task",
    {
      description: "Marca una tarea como hecha (status=done).",
      inputSchema: {
        id: z.string().describe("ID de la tarea"),
      },
    },
    async ({ id }) => {
      try {
        const c = getClient();
        const data = await rnvFetch(c, `/calendar/tasks/${id}`, {
          method: "PUT",
          body: JSON.stringify({ status: "done" }),
        });
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_cancel_task",
    {
      description: "Cancela una tarea (status=cancelled).",
      inputSchema: {
        id: z.string().describe("ID de la tarea"),
      },
    },
    async ({ id }) => {
      try {
        const c = getClient();
        const data = await rnvFetch(c, `/calendar/tasks/${id}`, {
          method: "DELETE",
        });
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_list_clients",
    { description: "Lista clientes RNV." },
    async () => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, "/clients"));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_get_client",
    {
      description: "Detalle de un cliente por ID.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, `/clients/${id}`));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_list_vps",
    { description: "Lista servidores VPS." },
    async () => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, "/vps"));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_get_vps",
    {
      description: "Detalle de un VPS por ID.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, `/vps/${id}`));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_list_services",
    { description: "Lista servicios desplegados." },
    async () => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, "/services"));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_get_service",
    {
      description: "Detalle de un servicio por ID.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, `/services/${id}`));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_list_offline",
    { description: "Lista servicios actualmente offline/caídos." },
    async () => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, "/services/offline"));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_billing_summary",
    { description: "Resumen de facturación / costos por cliente." },
    async () => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, "/billing"));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_billing_overdue",
    { description: "Lista clientes morosos (falta de pago)." },
    async () => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, "/billing/overdue"));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_billing_remind",
    {
      description:
        "Envía recordatorio de mora por correo (API). Requiere clientId o all=true. Role admin.",
      inputSchema: {
        clientId: z.string().optional().describe("ID del cliente"),
        all: z
          .boolean()
          .optional()
          .describe("Si true, recuerda a todos los morosos con email"),
      },
    },
    async ({ clientId, all }) => {
      try {
        if (!clientId && !all) {
          return errResult(new Error("Indica clientId o all=true"));
        }
        const c = getClient();
        const data = await rnvFetch(c, "/billing/remind", {
          method: "POST",
          body: JSON.stringify({ clientId, all: !!all }),
        });
        return jsonResult(data);
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_topology",
    {
      description:
        "Mapa de infraestructura: clusters VPS, servicios y clientes.",
    },
    async () => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, "/topology"));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_stats",
    {
      description: "Estadísticas del dashboard (totales, ingresos, etc.).",
    },
    async () => {
      try {
        const c = getClient();
        return jsonResult(await rnvFetch(c, "/stats"));
      } catch (e) {
        return errResult(e);
      }
    }
  );

  server.registerTool(
    "rnv_search",
    {
      description:
        "Busca en clientes, VPS y servicios por texto (nombre, email, IP, URL).",
      inputSchema: {
        query: z.string().min(1).describe("Texto a buscar"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Máx resultados por tipo (default 10)"),
      },
    },
    async ({ query, limit }) => {
      try {
        const c = getClient();
        const lim = limit ?? 10;
        const [clientsRaw, vpsRaw, servicesRaw] = await Promise.all([
          rnvFetch(c, "/clients"),
          rnvFetch(c, "/vps"),
          rnvFetch(c, "/services"),
        ]);
        const clients = asArray(clientsRaw)
          .filter((x) => matchesQuery(x, query))
          .slice(0, lim);
        const vps = asArray(vpsRaw)
          .filter((x) => matchesQuery(x, query))
          .slice(0, lim);
        const services = asArray(servicesRaw)
          .filter((x) => matchesQuery(x, query))
          .slice(0, lim);
        return jsonResult({
          query,
          counts: {
            clients: clients.length,
            vps: vps.length,
            services: services.length,
          },
          clients,
          vps,
          services,
        });
      } catch (e) {
        return errResult(e);
      }
    }
  );
}
