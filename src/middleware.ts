import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths - no auth required
  const publicPaths = ["/login"];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const session = request.cookies.get("rnv_session");
  const sessionValue = session?.value;

  // Valid session: JWT token set by Go API (long string) or legacy value
  const isAuthenticated =
    sessionValue === "authenticated" ||
    (!!sessionValue && sessionValue.length >= 32);

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
    "/((?!_next/static|_next/image|favicon.ico|whiteboard-app|.*\\.png$|.*\\.ico$).*)",
  ],
};
