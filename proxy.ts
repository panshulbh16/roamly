import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, authCookieOptions } from "@/lib/auth/config";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const c = authConfig();
  if (c.enabled) {
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
    await client.auth.getUser();
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
    "/auth/:path*",
    "/api/:path*",
  ],
};
