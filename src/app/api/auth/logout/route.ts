import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, deleteSession, clearSessionCookie } from "@/lib/auth";
import { logAudit, getClientIP } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("rnv_session")?.value;
    const user = token ? await getCurrentUser(request) : null;

    if (token && token !== "authenticated") {
      await deleteSession(token);
    }

    if (user) {
      await logAudit({
        action: "LOGOUT",
        entity: "user",
        entityId: user.id,
        description: `${user.name} cerró sesión`,
        ipAddress: getClientIP(request),
        userId: user.id,
      });
    }

    const response = NextResponse.json({ success: true });
    return clearSessionCookie(response);
  } catch (error) {
    const response = NextResponse.json({ success: true });
    return clearSessionCookie(response);
  }
}
