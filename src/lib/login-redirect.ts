/** Relative login URL. The browser keeps the public host from the reverse proxy. */
export function loginRedirectLocation(pathname: string): string {
    const path = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
    return `/login?redirect=${encodeURIComponent(path)}`;
}
