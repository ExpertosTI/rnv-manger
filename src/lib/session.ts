import crypto from "crypto";

const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getSessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        return "";
    }
    return secret;
}

function encodeBase64Url(value: string) {
    return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
    return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string) {
    return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken() {
    const secret = getSessionSecret();
    if (!secret) return "";
    const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const payload = JSON.stringify({ exp, v: 1 });
    const encoded = encodeBase64Url(payload);
    const signature = signPayload(encoded, secret);
    return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string | undefined) {
    if (!token) return false;
    const secret = getSessionSecret();
    if (!secret) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [encoded, signature] = parts;
    const expected = signPayload(encoded, secret);
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length) return false;
    if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return false;
    try {
        const payload = JSON.parse(decodeBase64Url(encoded));
        if (!payload?.exp || typeof payload.exp !== "number") return false;
        return payload.exp > Math.floor(Date.now() / 1000);
    } catch {
        return false;
    }
}

export function getSessionTtlSeconds() {
    return SESSION_TTL_SECONDS;
}
