import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, authCookieOptions } from "@/lib/auth/config";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const c = authConfig();
  if (!request.nextUrl?.pathname.startsWith("/share/") && c.enabled && request.cookies.getAll().some(({ name }) => name.startsWith("sb-"))) {
    const client = createServerClient(c.url, c.key, {
      cookieOptions: authCookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          for (const { name, value } of values)
            request.cookies.set(name, value);
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          for (const { name, value, options } of values)
            response.cookies.set(name, value, {
              ...options,
              ...authCookieOptions,
            });
        },
      },
    });
    // Refresh cookies only; routes verify identity with getUser() before authorizing.
    // Never use the unverified session returned here for access decisions.
    await client.auth.getSession();
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/",
    "/trips",
    "/history",
    "/explore",
    "/pricing",
    "/together",
    "/api/together",
    "/api/notifications",
    "/share/:path*",
    "/auth/:path*",
    "/api/auth/:path*",
    "/api/generate",
    "/api/regenerate",
    "/api/trips",
    "/api/history",
    "/api/waitlist",
    "/api/shares",
    "/api/billing/checkout",
    "/api/billing/status",
    "/api/billing/cancel",
  ],
};
