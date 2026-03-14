import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createSessionToken, getSessionTtlSeconds } from "@/lib/session";

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { password } = body;
        const ipKey = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
        const now = Date.now();
        const attempt = loginAttempts.get(ipKey);
        if (attempt && now - attempt.firstAttempt < WINDOW_MS && attempt.count >= MAX_ATTEMPTS) {
            return NextResponse.json({ success: false, message: "Too many attempts" }, { status: 429 });
        }

        const masterPassword = process.env.MASTER_PASSWORD;
        const sessionToken = createSessionToken();
        if (!masterPassword || !sessionToken) {
            return NextResponse.json({ success: false, message: "Server auth not configured" }, { status: 503 });
        }

        if (typeof password === "string") {
            const passwordBuffer = Buffer.from(password);
            const masterBuffer = Buffer.from(masterPassword);
            if (passwordBuffer.length === masterBuffer.length && crypto.timingSafeEqual(passwordBuffer, masterBuffer)) {
                loginAttempts.delete(ipKey);
                const response = NextResponse.json({ success: true });
                const hostname = request.nextUrl.hostname;
                const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
                const isSecure = request.nextUrl.protocol === "https:";
                response.cookies.set("rnv_session", sessionToken, {
                    httpOnly: true,
                    secure: isSecure && !isLocalhost,
                    sameSite: "strict",
                    maxAge: getSessionTtlSeconds(),
                    path: "/",
                });
                return response;
            }
        }

        if (!attempt || now - attempt.firstAttempt >= WINDOW_MS) {
            loginAttempts.set(ipKey, { count: 1, firstAttempt: now });
        } else {
            loginAttempts.set(ipKey, { count: attempt.count + 1, firstAttempt: attempt.firstAttempt });
        }
        return NextResponse.json({ success: false, message: "Invalid password" }, { status: 401 });
    } catch {
        return NextResponse.json({ success: false, message: "Error" }, { status: 500 });
    }
}
