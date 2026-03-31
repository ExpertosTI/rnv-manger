import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that don't require authentication
  const publicPaths = ["/login", "/api/auth/login", "/api/auth/logout", "/api/services/import"];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const session = request.cookies.get("rnv_session");
  const sessionValue = session?.value;

  // Check for valid session: either legacy "authenticated" or a hex token (64 chars)
  const isAuthenticated =
    sessionValue === "authenticated" || (!!sessionValue && sessionValue.length >= 32 && /^[a-f0-9]+$/i.test(sessionValue));

  // For API routes: return 401 JSON response
  if (pathname.startsWith("/api/")) {
    if (!isAuthenticated) {
      return NextResponse.json({ success: false, error: "Unauthorized - Please login first" }, { status: 401 });
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
