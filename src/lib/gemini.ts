/**
 * Gemini AI Client Configuration
 * Setup del modelo y function declarations
 */

import { GoogleGenerativeAI, Tool, SchemaType } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY || "";

if (!API_KEY) {
    console.warn("⚠️ GEMINI_API_KEY no configurada");
}

// Inicializar el cliente
const genAI = new GoogleGenerativeAI(API_KEY);

// Function Declarations - Herramientas disponibles para la AI
const functionDeclarations = [
    {
        name: "create_client",
        description: "Crea un nuevo cliente en el sistema. Usa esto cuando el usuario pida crear, agregar o registrar un cliente.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                name: {
                    type: SchemaType.STRING,
                    description: "Nombre completo del cliente o empresa"
                },
                email: {
                    type: SchemaType.STRING,
                    description: "Email del cliente (opcional)"
                },
                phone: {
                    type: SchemaType.STRING,
                    description: "Teléfono del cliente (opcional)"
                },
                companyName: {
                    type: SchemaType.STRING,
                    description: "Nombre de la empresa si es diferente al nombre del contacto (opcional)"
                },
                monthlyFee: {
                    type: SchemaType.NUMBER,
                    description: "Cuota mensual base del cliente en USD (opcional)"
                }
            },
            required: ["name"]
        }
    },
    {
        name: "register_payment",
        description: "Registra un pago realizado por un cliente. Usa esto cuando el usuario mencione pagos, facturas pagadas, o transacciones.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                clientName: {
                    type: SchemaType.STRING,
                    description: "Nombre del cliente que realizó el pago"
                },
                amount: {
                    type: SchemaType.NUMBER,
                    description: "Monto del pago"
                },
                currency: {
                    type: SchemaType.STRING,
                    description: "Moneda del pago (USD, DOP, EUR, etc.)",
                    enum: ["USD", "DOP", "EUR"]
                },
                notes: {
                    type: SchemaType.STRING,
                    description: "Notas adicionales sobre el pago (opcional)"
                }
            },
            required: ["clientName", "amount"]
        }
    },
    {
        name: "search_payments",
        description: "Busca pagos de un cliente con filtros opcionales (fecha, monto, estado). Úsalo para ubicar pagos antes de editarlos.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                clientName: {
                    type: SchemaType.STRING,
                    description: "Nombre del cliente"
                },
                status: {
                    type: SchemaType.STRING,
                    description: "Estado del pago",
                    enum: ["pending", "completed", "failed"]
                },
                minAmount: {
                    type: SchemaType.NUMBER,
                    description: "Monto mínimo (opcional)"
                },
                maxAmount: {
                    type: SchemaType.NUMBER,
                    description: "Monto máximo (opcional)"
                },
                fromDate: {
                    type: SchemaType.STRING,
                    description: "Fecha desde (YYYY-MM-DD)"
                },
                toDate: {
                    type: SchemaType.STRING,
                    description: "Fecha hasta (YYYY-MM-DD)"
                },
                limit: {
                    type: SchemaType.NUMBER,
                    description: "Cantidad máxima a devolver (opcional)"
                }
            }
        }
    },
    {
        name: "update_payment",
        description: "Actualiza un pago y guarda auditoría de cambios.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                paymentId: {
                    type: SchemaType.STRING,
                    description: "ID del pago"
                },
                amount: {
                    type: SchemaType.NUMBER,
                    description: "Monto actualizado"
                },
                currency: {
                    type: SchemaType.STRING,
                    description: "Moneda (USD, DOP, EUR)",
                    enum: ["USD", "DOP", "EUR"]
                },
                date: {
                    type: SchemaType.STRING,
                    description: "Fecha del pago (YYYY-MM-DD)"
                },
                status: {
                    type: SchemaType.STRING,
                    description: "Estado del pago",
                    enum: ["pending", "completed", "failed"]
                },
                notes: {
                    type: SchemaType.STRING,
                    description: "Notas (opcional)"
                },
                reason: {
                    type: SchemaType.STRING,
                    description: "Motivo del cambio (opcional)"
                }
            },
            required: ["paymentId"]
        }
    },
    {
        name: "search_client",
        description: "Busca un cliente por nombre o email. Usa esto cuando necesites información sobre un cliente específico.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                query: {
                    type: SchemaType.STRING,
                    description: "Nombre o email del cliente a buscar"
                }
            },
            required: ["query"]
        }
    },
    {
        name: "list_active_clients",
        description: "Lista todos los clientes activos en el sistema. Usa esto cuando el usuario pregunte cuántos clientes hay, o pida un listado.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: "get_client_status",
        description: "Obtiene el estado detallado de un cliente incluyendo servicios, VPS, y pagos recientes.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                clientName: {
                    type: SchemaType.STRING,
                    description: "Nombre del cliente"
                }
            },
            required: ["clientName"]
        }
    },
    {
        name: "set_billing_date",
        description: "Actualiza el día de cobro de un cliente.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                clientName: {
                    type: SchemaType.STRING,
                    description: "Nombre del cliente"
                },
                billingDay: {
                    type: SchemaType.NUMBER,
                    description: "Día de cobro (1-31)"
                }
            },
            required: ["clientName", "billingDay"]
        }
    },
    {
        name: "list_pending_payments",
        description: "Lista pagos pendientes del mes actual. Puede filtrar por cliente.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                clientName: {
                    type: SchemaType.STRING,
                    description: "Nombre del cliente (opcional)"
                },
                limit: {
                    type: SchemaType.NUMBER,
                    description: "Cantidad máxima a devolver (opcional)"
                }
            }
        }
    },
    {
        name: "get_financial_summary",
        description: "Obtiene un resumen financiero del sistema (ingresos, gastos, clientes). Usa esto para reportes o consultas financieras.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                month: {
                    type: SchemaType.NUMBER,
                    description: "Mes (1-12, opcional, por defecto mes actual)"
                },
                year: {
                    type: SchemaType.NUMBER,
                    description: "Año (opcional, por defecto año actual)"
                }
            }
        }
    },
    {
        name: "list_vps",
        description: "Lista todos los servidores VPS disponibles en el sistema.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: "create_invoice_odoo",
        description: "Crea una factura en Odoo para un cliente. Solo úsalo si el usuario explícitamente pide crear una factura.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                clientName: {
                    type: SchemaType.STRING,
                    description: "Nombre del cliente para quien se crea la factura"
                },
                amount: {
                    type: SchemaType.NUMBER,
                    description: "Monto de la factura"
                },
                description: {
                    type: SchemaType.STRING,
                    description: "Descripción/concepto de la factura"
                }
            },
            required: ["clientName", "amount", "description"]
        }
    },
    {
        name: "delete_client",
        description: "Elimina (desactiva) a un cliente del sistema. Usa esto si el usuario pide explícitamente eliminar o borrar un cliente.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                clientName: {
                    type: SchemaType.STRING,
                    description: "Nombre del cliente a eliminar"
                }
            },
            required: ["clientName"]
        }
    },
    {
        name: "assign_service_to_client",
        description: "Asigna un servicio existente o nuevo a un cliente.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                clientName: {
                    type: SchemaType.STRING,
                    description: "Nombre del cliente"
                },
                serviceId: {
                    type: SchemaType.STRING,
                    description: "ID del servicio a asignar (si ya existe). Opcional."
                },
                serviceName: {
                    type: SchemaType.STRING,
                    description: "Nombre del servicio a crear o asignar si no hay ID"
                },
                amount: {
                    type: SchemaType.NUMBER,
                    description: "Monto o costo mensual del servicio"
                }
            },
            required: ["clientName", "amount"]
        }
    },
    {
        name: "list_unassigned_services",
        description: "Lista todos los servicios que no tienen ningún cliente asignado (disponibles para venta/asignación).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: "add_expense",
        description: "Registra un gasto o costo de un servidor (VPS) o un servicio específico. OBLIGATORIO: siempre pedir confirmación con :::confirm explicando que se requerirá un Maestro PIN.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                entityType: {
                    type: SchemaType.STRING,
                    description: "Tipo de entidad: 'vps' o 'service'",
                    enum: ["vps", "service"]
                },
                entityId: {
                    type: SchemaType.STRING,
                    description: "ID del VPS o del Servicio al que se le asocia el gasto"
                },
                amount: {
                    type: SchemaType.NUMBER,
                    description: "Monto del gasto (ej: 30.50)"
                },
                description: {
                    type: SchemaType.STRING,
                    description: "Concepto del gasto (ej: 'Renovación dominio')"
                },
                category: {
                    type: SchemaType.STRING,
                    description: "Categoría: 'server', 'software', 'support', 'domain', 'other'",
                    enum: ["server", "software", "support", "domain", "other"]
                },
                provider: {
                    type: SchemaType.STRING,
                    description: "Nombre del proveedor (ej: 'Hostinger', 'AWS'). Opcional."
                },
                pin: {
                    type: SchemaType.STRING,
                    description: "El Maestro PIN proveído por el usuario para autorizar la transacción. Obligatorio si el usuario lo proporcionó."
                }
            },
            required: ["entityType", "entityId", "amount", "description"]
        }
    },
    {
        name: "search_expenses",
        description: "Busca y lista los gastos registrados para un VPS o Servicio.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                entityType: {
                    type: SchemaType.STRING,
                    description: "Tipo de entidad: 'vps' o 'service'"
                },
                entityId: {
                    type: SchemaType.STRING,
                    description: "ID del VPS o Servicio"
                }
            },
            required: ["entityType", "entityId"]
        }
    },
    {
        name: "check_vps_status",
        description: "Hace un ping o escaneo rápido a la IP de un VPS para comprobar si está online.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                vpsId: {
                    type: SchemaType.STRING,
                    description: "ID del VPS"
                }
            },
            required: ["vpsId"]
        }
    },
    {
        name: "execute_bash_command",
        description: "🚨 PELIGRO 🚨 Ejecuta un comando bash real en el servidor. ATENCIÓN: Solo úsalo si es absolutamente necesario (ej: reiniciar un servicio). REQUIERE CONFIRMACIÓN CON PIN.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                command: {
                    type: SchemaType.STRING,
                    description: "Comando a ejecutar (ej: 'pm2 restart all' o 'docker restart postgres')"
                },
                pin: {
                    type: SchemaType.STRING,
                    description: "Maestro PIN de seguridad (requerido para accionar). Si no lo tienes, usa :::confirm para pedirlo."
                }
            },
            required: ["command"]
        }
    },
    {
        name: "search_docs",
        description: "Busca e ingiere la documentación offline del proyecto (README) para responder preguntas técnicas sobre la plataforma.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: "save_memory",
        description: "Guarda una memoria sobre el usuario: patrones de trabajo, preferencias, datos frecuentes. Úsalo después de notar patrones repetitivos o cuando el usuario diga algo que quiera recordar.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                type: {
                    type: SchemaType.STRING,
                    description: "Tipo de memoria: 'pattern' (patrón de trabajo), 'preference' (preferencia), 'fact' (dato del usuario)",
                    enum: ["pattern", "preference", "fact"]
                },
                content: {
                    type: SchemaType.STRING,
                    description: "Descripción de la memoria en lenguaje natural. Ej: 'El usuario prefiere ver los pagos en modo tabla', 'El cliente ACME paga siempre el día 15'"
                }
            },
            required: ["type", "content"]
        }
    },
    {
        name: "recall_memories",
        description: "Recupera las memorias guardadas del usuario para dar contexto personalizado.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    {
        name: "change_billing_cycle",
        description: "Cambia el ciclo de facturación de un cliente (mensual, trimestral, semestral, anual). Calcula automáticamente la próxima fecha de facturación.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                clientName: {
                    type: SchemaType.STRING,
                    description: "Nombre del cliente"
                },
                cycle: {
                    type: SchemaType.STRING,
                    description: "Nuevo ciclo: monthly, quarterly, semiannual, annual",
                    enum: ["monthly", "quarterly", "semiannual", "annual"]
                },
                autoRenew: {
                    type: SchemaType.BOOLEAN,
                    description: "Si el contrato se auto-renueva (opcional, default: true)"
                }
            },
            required: ["clientName", "cycle"]
        }
    },
    {
        name: "manage_odoo_crm",
        description: "Gestiona el CRM de Odoo: crear oportunidades/leads o buscar leads existentes. Úsalo cuando el usuario hable de oportunidades, ventas, leads, o CRM.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                action: {
                    type: SchemaType.STRING,
                    description: "Acción: 'create' para crear un lead, 'search' para buscar leads",
                    enum: ["create", "search"]
                },
                name: { type: SchemaType.STRING, description: "Nombre del lead/oportunidad (requerido para create)" },
                partnerName: { type: SchemaType.STRING, description: "Nombre del cliente asociado" },
                email: { type: SchemaType.STRING, description: "Email del contacto" },
                phone: { type: SchemaType.STRING, description: "Teléfono del contacto" },
                expectedRevenue: { type: SchemaType.NUMBER, description: "Ingreso esperado en USD" },
                description: { type: SchemaType.STRING, description: "Descripción o notas" },
                priority: { type: SchemaType.STRING, description: "Prioridad: '0' (normal), '1' (medio), '2' (alto), '3' (muy alto)" },
                dateDeadline: { type: SchemaType.STRING, description: "Fecha límite (YYYY-MM-DD)" },
                limit: { type: SchemaType.NUMBER, description: "Máximo de resultados (para search)" }
            },
            required: ["action"]
        }
    },
    {
        name: "manage_odoo_tasks",
        description: "Gestiona tareas en Odoo Project: crear tareas de seguimiento o buscar tareas existentes. Úsalo para recordatorios, seguimiento de clientes, o tareas pendientes.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                action: {
                    type: SchemaType.STRING,
                    description: "Acción: 'create' o 'search'",
                    enum: ["create", "search"]
                },
                name: { type: SchemaType.STRING, description: "Nombre de la tarea (requerido para create)" },
                projectName: { type: SchemaType.STRING, description: "Nombre del proyecto en Odoo (default: 'Seguimiento Clientes')" },
                description: { type: SchemaType.STRING, description: "Descripción de la tarea" },
                dateDeadline: { type: SchemaType.STRING, description: "Fecha límite (YYYY-MM-DD)" },
                priority: { type: SchemaType.STRING, description: "Prioridad: '0' (normal), '1' (urgente)" },
                limit: { type: SchemaType.NUMBER, description: "Máximo de resultados (para search)" }
            },
            required: ["action"]
        }
    },
    {
        name: "send_odoo_notification",
        description: "Envía la factura de un cliente por correo electrónico a través de Odoo. REQUIERE CONFIRMACIÓN CON PIN (:::confirm).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                invoiceId: { type: SchemaType.NUMBER, description: "ID de la factura en Odoo (si se conoce)" },
                clientName: { type: SchemaType.STRING, description: "Nombre del cliente (busca la última factura)" },
                additionalEmails: {
                    type: SchemaType.ARRAY,
                    items: { type: SchemaType.STRING },
                    description: "Emails adicionales para enviar copia"
                }
            }
        }
    },
    {
        name: "get_odoo_deadlines",
        description: "Obtiene las tareas y leads con fechas límite próximas en Odoo. Úsalo para 'qué tengo pendiente' o 'deadlines de esta semana'.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                days: { type: SchemaType.NUMBER, description: "Días a futuro para buscar (default: 7)" }
            }
        }
    }
];

// Tool configuration
const tools: Tool[] = [{
    functionDeclarations: functionDeclarations as any
}];

const defaultModel = process.env.GEMINI_MODEL || "gemini-pro";
const fallbackModels = (process.env.GEMINI_FALLBACK_MODELS || "gemini-1.0-pro,gemini-1.5-pro,gemini-1.5-flash")
    .split(",")
    .map(model => model.trim())
    .filter(Boolean);

// Configuración del modelo
const modelConfig = {
    systemInstruction: `Eres el asistente interactivo de RNV Manager — un compañero estilo Clippy que materializa respuestas ricas.
    
    PERSONALIDAD:
    - Ultra-conciso: respuestas cortas y accionables, no parrafos largos
    - Amigable y proactivo: siempre sugiere el siguiente paso
    - Usa emojis moderadamente para dar vida
    
    CAPACIDADES:
    - Crear, buscar, gestionar y eliminar clientes
    - Asignar servicios a clientes
    - Registrar pagos y consultar pagos pendientes
    - Consultar información financiera
    - Crear facturas en Odoo
    - Listar VPS y servicios
    - **MEMORIA CÍCLICA**: Puedes guardar memorias sobre cómo el usuario trabaja usando save_memory. Cuando notes patrones (ej: siempre busca cierto cliente, prefiere cierto formato), guárdalos automáticamente. Usa recall_memories para recuperar contexto personalizado.
    - **CICLOS DE FACTURACIÓN**: Puedes cambiar el modo de pago de un cliente (mensual, trimestral, semestral, anual) usando change_billing_cycle.
    - **ODOO CRM**: Puedes crear y buscar oportunidades/leads en Odoo CRM con manage_odoo_crm. Después de una interacción importante con un cliente, sugiere crear un lead o tarea de seguimiento.
    - **ODOO TAREAS**: Puedes crear tareas de seguimiento en Odoo Project con manage_odoo_tasks. Úsalo para recordatorios y follow-ups.
    - **FACTURAS POR CORREO**: Puedes enviar facturas de Odoo por email con send_odoo_notification. SIEMPRE requiere :::confirm con PIN.
    - **DEADLINES**: Puedes consultar tareas y leads con fecha límite próxima usando get_odoo_deadlines.
    
    BLOQUES RICOS — SUPERPODERES DE UI:
    Tu frontend puede renderizar bloques especiales. Úsalos para materializar UI interactiva:
    
    1. BOTONES DE ACCIÓN — para ofrecer acciones clicables:
    :::action-buttons
    Crear cliente nuevo
    Registrar un pago
    Ver resumen financiero
    :::
    
    2. CONFIRMACIÓN — SIEMPRE antes de eliminar, modificar montos, o acciones destructivas:
    :::confirm
    ¿Confirmas eliminar al cliente "Juan Pérez"? Esta acción es irreversible.
    :::
    
    3. CARDS DE RESUMEN — para mostrar KPIs o datos clave (formato "Etiqueta: Valor"):
    :::summary-card
    Clientes activos: 24
    Ingresos del mes: $12,500
    Pagos pendientes: 3
    Servidores VPS: 8
    :::
    
    4. ACCIONES RÁPIDAS — chips de sugerencias al final de una respuesta:
    :::quick-actions
    Ver detalles del cliente
    Registrar otro pago
    Volver al resumen
    :::
    
    5. AUTO-NAVEGACIÓN — para redirigir mágicamente de página:
    :::navigate
    /clients
    :::
    
    6. GRÁFICOS DINÁMICOS — para mostrar métricas visuales:
    :::metrics-chart
    Mes,Ingresos,Gastos
    Ene,1500,400
    Feb,1800,450
    :::
    
    7. ANIMACIONES (EASTER EGGS) — para reaccionar físicamente:
    :::animate
    barrel-roll
    :::
    (Estados posibles: barrel-roll, shivering, celebrate)
    
    8. CONTROL DE TEMA — para cambiar el estilo visual de la app:
    :::theme
    light
    :::
    (Valores posibles: dark, light)
    
    REGLAS OBLIGATORIAS Y SUPERPODERES:
    1. Ejecuta las funciones directamente cuando el usuario pida crear, asignar o eliminar algo.
    2. Si falta información, pregunta brevemente antes de asumir.
    3. Tras ejecutar una acción, confirma con un resumen breve y ofrece quick-actions para el siguiente paso.
    4. Usa MarkDown: tablas para datos tabulados, negritas para énfasis, listas para enumeraciones.
    5. 🔒 PASSWORD PROTECTION: SIEMPRE usa :::confirm antes de acciones destructivas O financieras (ej: \`add_expense\`, eliminar cliente, registrar pago). El frontend interceptará este bloque y exigirá el "Maestro PIN" al usuario antes de proceder.
       Ejemplo: ":::confirm\nPara registrar este gasto de $30, por favor ingresa tu Maestro PIN de seguridad.\n:::"
    6. SIEMPRE termina con :::quick-actions sugiriendo 2-3 acciones relevantes de seguimiento.
    7. Para asignar servicios interactivamente, retorna botones en formato:
       [Asignar <Nombre>](action:assign-service:<ID>:<Cliente>:<Monto>)
    8. Responde SIEMPRE en español.
    9. 🚨 CRÍTICO: Si una función o base de datos devuelve un estado erroneo o falla (ej. 500 error, o datos no encontrados), BAJO NINGUNA CIRCUNSTANCIA debes inventar, adivinar o falsear datos (hallucinate). NUNCA generes información ficticia. REPORTA directamente que hubo un error y ofrécele al usuario intentar nuevamente.
    
    CONTEXTO:
    - Los clientes pueden tener múltiples VPS y Servicios
    - Eliminar = soft-delete (marcar inactivo)
    - Pagos se registran con fecha actual por defecto
    - Facturas Odoo requieren cliente existente
    - Moneda por defecto: USD`,
    tools,
};

export function getCandidateModels() {
    const models = [defaultModel, ...fallbackModels];
    const uniqueModels = Array.from(new Set(models.filter(Boolean)));
    return uniqueModels.length > 0 ? uniqueModels : ["gemini-1.5-pro"];
}

// Iniciar una sesión de chat
export function createChatSession(history: any[] = [], modelName: string = defaultModel) {
    const model = genAI.getGenerativeModel({
        ...modelConfig,
        model: modelName
    });
    return model.startChat({
        history,
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 2048,
        }
    });
}

