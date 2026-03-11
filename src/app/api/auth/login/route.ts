import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { password } = body;

        const masterPassword = process.env.MASTER_PASSWORD || "admin123";

        if (password === masterPassword) {
            const response = NextResponse.json({ success: true });
            const hostname = request.nextUrl.hostname;
            const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
            const isSecure = request.nextUrl.protocol === "https:";

            // Set a simple cookie for "session"
            response.cookies.set("rnv_session", "authenticated", {
                httpOnly: true,
                secure: isSecure && !isLocalhost,
                sameSite: "lax",
                maxAge: 60 * 60 * 24, // 24 hours
                path: "/",
            });

            return response;
        }

        return NextResponse.json({ success: false, message: "Invalid password" }, { status: 401 });
    } catch (error) {
        return NextResponse.json({ success: false, message: "Error" }, { status: 500 });
    }
}
