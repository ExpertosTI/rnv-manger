import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Solo rutas de UI — /api va directo a go-api vía Traefik
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
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api") || pathname === "/login") {
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
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/clients/:path*",
    "/vps/:path*",
    "/services/:path*",
    "/billing/:path*",
    "/audit/:path*",
    "/users/:path*",
    "/settings/:path*",
    "/whiteboard/:path*",
    "/config-editor/:path*",
  ],
};
