import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes are handled by Go backend (Traefik). Never redirect them to login.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Public paths - no auth required
  const publicPaths = ["/login"];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const session = request.cookies.get("rnv_session");
  const sessionValue = session?.value;

  // JWT session cookie set by Go API (three base64 segments)
  const isAuthenticated =
    !!sessionValue &&
    sessionValue.length >= 32 &&
    sessionValue.split(".").length === 3;

  // Redirect unauthenticated users to login
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
    "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|whiteboard-app|.*\\.png$|.*\\.ico$).*)",
  ],
};
