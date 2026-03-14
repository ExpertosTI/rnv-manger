import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function decodeBase64Url(value: string) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return atob(padded);
}

async function verifySessionToken(token: string | undefined) {
    if (!token) return false;
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [encoded, signature] = parts;
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const expectedBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
    const expected = btoa(String.fromCharCode(...new Uint8Array(expectedBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (expected !== signature) return false;
    try {
        const payload = JSON.parse(decodeBase64Url(encoded));
        return typeof payload?.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
    } catch {
        return false;
    }
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Public paths that don't require authentication
    const publicPaths = ["/login", "/api/auth", "/api/services/import"];
    if (publicPaths.some(path => pathname.startsWith(path))) {
        return NextResponse.next();
    }

    const session = request.cookies.get("rnv_session");
    const isAuthenticated = await verifySessionToken(session?.value);

    // For API routes: return 401 JSON response
    if (pathname.startsWith("/api/")) {
        if (!isAuthenticated) {
            return NextResponse.json(
                { success: false, error: "Unauthorized - Please login first" },
                { status: 401 }
            );
        }
        return NextResponse.next();
    }

    // For pages: redirect to login
    if (!isAuthenticated) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("redirect", pathname);
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Match all paths except static files and whiteboard
        "/((?!_next/static|_next/image|favicon.ico|whiteboard-app|.*\\.png$|.*\\.ico$).*)",
    ],
};
