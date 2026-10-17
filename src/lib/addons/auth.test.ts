import assert from "node:assert/strict";
import test from "node:test";
import { hasValidSession } from "./auth";

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

test("exige una sesión válida contra /api/auth/me", async () => {
    const calls: { url: string; cookie?: string; authorization?: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
        const headers = new Headers(init?.headers);
        calls.push({
            url: String(input),
            cookie: headers.get("cookie") || undefined,
            authorization: headers.get("authorization") || undefined,
        });
        const cookie = headers.get("cookie") || "";
        if (cookie.includes("good.token.value")) {
            return jsonResponse(200, { success: true, user: { id: "1" } });
        }
        if ((headers.get("authorization") || "").includes("Bearer good")) {
            return jsonResponse(200, { success: true, user: { id: "1" } });
        }
        return jsonResponse(401, { success: false });
    };

    assert.equal(await hasValidSession({}, fetchImpl), false);
    assert.equal(await hasValidSession({ cookie: "short" }, fetchImpl), false);
    assert.equal(await hasValidSession({ cookie: "good.token.value" }, fetchImpl), true);
    assert.equal(await hasValidSession({ authorization: "Bearer good" }, fetchImpl), true);
    assert.equal(await hasValidSession({ cookie: "a\nb" }, fetchImpl), false);
    assert.equal(calls[0]?.url.endsWith("/api/auth/me"), true);
    assert.match(calls.find((call) => call.cookie?.includes("good.token.value"))?.cookie || "", /^rnv_session=/);

    const redirecting: typeof fetch = async () => new Response(null, { status: 302, headers: { Location: "http://localhost/login" } });
    assert.equal(await hasValidSession({ cookie: "good.token.value" }, redirecting), false);

    const down: typeof fetch = async () => {
        throw new Error("econnrefused");
    };
    assert.equal(await hasValidSession({ cookie: "good.token.value" }, down), false);

    const unsigned: typeof fetch = async () => jsonResponse(200, { success: false });
    assert.equal(await hasValidSession({ cookie: "good.token.value" }, unsigned), false);
});
