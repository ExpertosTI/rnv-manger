const DEFAULT_URL = "https://rnv.renace.tech";

export type RnvClient = {
  baseUrl: string;
  token: string;
};

export function createClient(): RnvClient {
  const baseUrl = (process.env.RNV_API_URL || DEFAULT_URL).replace(/\/+$/, "");
  const token = (process.env.RNV_API_TOKEN || "").trim();
  if (!token) {
    throw new Error(
      "Falta RNV_API_TOKEN. Crea un service token admin en RNV (Ajustes / API) y exporta RNV_API_TOKEN=rnv_…"
    );
  }
  if (!token.startsWith("rnv_")) {
    throw new Error("RNV_API_TOKEN debe ser un service token con prefijo rnv_");
  }
  return { baseUrl, token };
}

export async function rnvFetch(
  client: RnvClient,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const url = path.startsWith("http")
    ? path
    : `${client.baseUrl}/api${path.startsWith("/") ? path : `/${path}`}`;

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
    throw new Error(`RNV API ${res.status} ${path}: ${errMsg}`);
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
