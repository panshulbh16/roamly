import { authCookieOptions } from "@/lib/auth/config";
import { cookies } from "next/headers";
import { authClient } from "@/lib/auth/server";
import { safeReturnTo } from "@/lib/auth/policy";
export async function GET(r: Request) {
  const jar = await cookies();
  const url = new URL(r.url);
  const code = url.searchParams.get("code");
  const client = await authClient(true);
  if (code && client) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const target = safeReturnTo(jar.get("roamly-auth-return")?.value);
      jar.delete("roamly-auth-return");
      jar.delete("roamly-signed-out");
      jar.set("roamly-auth-provider", "supabase", {
        ...authCookieOptions,
        maxAge: 31536000,
      });
      return Response.redirect(new URL(target, r.url), 303);
    }
  }
  const target = safeReturnTo(jar.get("roamly-auth-return")?.value);
  jar.delete("roamly-auth-return");
  return Response.redirect(
    new URL(
      "/auth?error=callback&returnTo=" + encodeURIComponent(target),
      r.url,
    ),
    303,
  );
}
