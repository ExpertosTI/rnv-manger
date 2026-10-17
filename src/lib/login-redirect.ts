/** Path and query for the login redirect. The middleware turns this into an absolute URL. */
export function loginRedirectLocation(pathname: string): string {
    const path = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
    return `/login?redirect=${encodeURIComponent(path)}`;
}

type RedirectRequest = {
    nextUrl: { pathname: string; protocol: string; host: string };
    headers: { get(name: string): string | null };
};

/** Absolute login URL. Forwarded host/proto win so a reverse proxy keeps the public origin. */
export function loginRedirectURL(request: RedirectRequest): URL {
    const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    return new URL(loginRedirectLocation(request.nextUrl.pathname), `${proto}://${host}`);
}
