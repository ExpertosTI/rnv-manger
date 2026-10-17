const SESSION_COOKIE = "rnv_session";

export type SessionSource = {
    cookie?: string | null;
    authorization?: string | null;
};

function apiBase(): string {
    return (process.env.API_INTERNAL_URL || "http://go-api:8080").replace(/\/$/, "");
}

function safeHeader(value: string): boolean {
    return value.length > 0 && !/[\r\n]/.test(value);
}

/**
 * Confirm the caller has a live RNV session by asking the Go API.
 * Fails closed: missing cookie, network errors, redirects, and unsigned tokens are rejected.
 */
export async function hasValidSession(
    source: SessionSource,
    fetchImpl: typeof fetch = fetch
): Promise<boolean> {
    const headers = new Headers();
    const cookie = source.cookie?.trim() || "";
    const authorization = source.authorization?.trim() || "";
    if (cookie) {
        if (!safeHeader(cookie) || cookie.includes(";")) return false;
        headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
    }
    if (authorization) {
        if (!safeHeader(authorization) || !authorization.toLowerCase().startsWith("bearer ")) return false;
        headers.set("authorization", authorization);
    }
    if (!headers.has("cookie") && !headers.has("authorization")) return false;

    let response: Response;
    try {
        response = await fetchImpl(`${apiBase()}/api/auth/me`, {
            method: "GET",
            headers,
            cache: "no-store",
            redirect: "manual",
        });
    } catch {
        return false;
    }
    if (response.status !== 200) return false;
    const body = (await response.json().catch(() => null)) as { success?: boolean; user?: unknown } | null;
    return Boolean(body?.success && body.user);
}
