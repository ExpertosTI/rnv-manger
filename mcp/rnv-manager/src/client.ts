import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://rnv.renace.tech";

export type RnvClient = {
  baseUrl: string;
  token: string;
};

/** Carga mcp/rnv-manager/.env — archivo fácil, sin export en la shell. */
function loadDotEnvFile(): void {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.join(here, "..", ".env");
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  } catch {
    /* ignore */
  }
}

loadDotEnvFile();

export function createClient(): RnvClient {
  const baseUrl = (process.env.RNV_API_URL || DEFAULT_URL).replace(/\/+$/, "");
  const token = (process.env.RNV_API_TOKEN || "").trim();
  if (!token || token.includes("PEGA_AQUI") || token === "rnv_...") {
    throw new Error(
      "Falta el token en mcp/rnv-manager/.env — abre ese archivo, pega RNV_API_TOKEN=rnv_… (genera el token en Ajustes → Cursor MCP) y reinicia el MCP."
    );
  }
  if (!token.startsWith("rnv_")) {
    throw new Error("RNV_API_TOKEN debe ser un service token con prefijo rnv_");
  }
  return { baseUrl, token };
}

export async function rnvFetch(
  client: RnvClient,
  pathName: string,
  init: RequestInit = {}
): Promise<unknown> {
  const url = pathName.startsWith("http")
    ? pathName
    : `${client.baseUrl}/api${pathName.startsWith("/") ? pathName : `/${pathName}`}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${client.token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw text */
  }

  if (!res.ok) {
    const errMsg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : text.slice(0, 400) || res.statusText;
    throw new Error(`RNV API ${res.status} ${pathName}: ${errMsg}`);
  }
  return body;
}

export function jsonResult(data: unknown, maxChars = 80_000): { content: { type: "text"; text: string }[] } {
  let text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + `\n… [truncado ${text.length - maxChars} chars]`;
  }
  return { content: [{ type: "text" as const, text }] };
}

export function errResult(err: unknown): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export function qs(params: Record<string, string | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
