import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { loginRedirectURL } from "@/lib/login-redirect";

const PROTECTED_PREFIXES = [
  "/clients",
  "/vps",
  "/services",
  "/billing",
  "/audit",
  "/users",
  "/settings",
  "/whiteboard",
  "/config-editor",
  "/addons",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API → proxy interno (next.config rewrites) o Traefik; nunca login
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    return NextResponse.next();
  }

  const isProtected =
    pathname === "/" ||
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!isProtected) {
    return NextResponse.next();
  }

  const session = request.cookies.get("rnv_session");
  const sessionValue = session?.value;

  const isAuthenticated =
    !!sessionValue &&
    sessionValue.length >= 32 &&
    sessionValue.split(".").length === 3;

  if (!isAuthenticated) {
    return NextResponse.redirect(loginRedirectURL(request), 307);
  }

  return NextResponse.next();
}

// Excluir /api y assets estáticos (svg, png, etc.) — el matcher anterior bloqueaba renace-cone.svg
export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|whiteboard-app|.*\\.(?:png|svg|ico|webp|jpg|jpeg|gif|woff2?|css|js)$).*)",
  ],
};
