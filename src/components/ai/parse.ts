import type { RichBlock, RichBlockType } from "./types";

const BLOCK_RE = /:::([\w][\w-]*)\n([\s\S]*?):::/g;

/** Remove rich blocks before sending history to API (saves tokens). */
export function stripRichBlocks(content: string): string {
    return content.replace(BLOCK_RE, "").replace(/\s+/g, " ").trim();
}

export function parseRichBlocks(content: string): RichBlock[] {
    const blocks: RichBlock[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    BLOCK_RE.lastIndex = 0;
    while ((match = BLOCK_RE.exec(content)) !== null) {
        if (match.index > lastIndex) {
            const text = content.slice(lastIndex, match.index).trim();
            if (text) blocks.push({ type: "text", content: text });
        }

        const blockType = match[1] as RichBlockType;
        const blockContent = match[2].trim();

        if (blockType === "theme") {
            applyTheme(blockContent);
        } else if (blockType === "animate") {
            // Handled by parent via content scan
        } else {
            const items = blockContent
                .split("\n")
                .map((l) => l.replace(/^[-•]\s*/, "").trim())
                .filter(Boolean);
            blocks.push({ type: blockType, content: blockContent, items });
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        const text = content.slice(lastIndex).trim();
        if (text) blocks.push({ type: "text", content: text });
    }

    return blocks.length > 0 ? blocks : [{ type: "text", content }];
}

function applyTheme(mode: string) {
    if (typeof document === "undefined") return;
    const lower = mode.toLowerCase();
    if (lower === "light" || lower === "claro") {
        document.documentElement.classList.remove("dark");
        document.documentElement.style.colorScheme = "light";
    } else {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
    }
}

export function detectMascotAnimation(
    content: string
): "barrel-roll" | "shivering" | "celebrate" | null {
    if (content.includes(":::animate\nbarrel-roll")) return "barrel-roll";
    if (content.includes(":::animate\nshivering")) return "shivering";
    if (content.includes(":::animate\ncelebrate")) return "celebrate";
    return null;
}

export function suggestionsForPath(path: string): string[] {
    if (path.includes("/clients/")) return ["Resumen de este cliente", "Registrar un pago", "Ver servicios"];
    if (path.includes("/clients")) return ["Clientes activos", "Clientes morosos", "Crear cliente"];
    if (path.includes("/vps/")) return ["Estado de este VPS", "Listar servicios", "Ver gastos"];
    if (path.includes("/vps")) return ["Listar servidores", "VPS detenidos", "Resumen de costos"];
    if (path.includes("/services/")) return ["Detalle del servicio", "Asignar a cliente", "Ver costos"];
    if (path.includes("/services")) return ["Listar servicios", "Servicios sin cliente"];
    if (path.includes("/billing")) return ["Pagos pendientes", "Resumen financiero", "Registrar un pago"];
    if (path.includes("/map")) return ["Mapa de infraestructura", "Servicios por VPS", "Costos por cliente"];
    if (path.includes("/calendar")) return ["Próximos vencimientos", "Programar recordatorio", "Tareas pendientes"];
    if (path.includes("/settings")) return ["Probar conexión Odoo", "Resumen RNV"];
    if (path === "/") return ["Resumen general", "Clientes morosos", "Estado servidores"];
    return ["Resumen general", "Buscar...", "¿Qué puedo hacer?"];
}
