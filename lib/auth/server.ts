import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authConfig, authCookieOptions, platformAuth } from "./config";
import { authPath } from "./policy";
export type AppUser = {
  id: string;
  email: string;
  displayName: string;
  provider: "Google / email" | "ChatGPT";
};
export async function authClient(writable = false) {
  const c = authConfig();
  if (!c.enabled) return null;
  const jar = await cookies();
  return createServerClient(c.url, c.key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        if (writable)
          for (const { name, value, options } of values)
            jar.set(name, value, { ...options, ...authCookieOptions });
      },
    },
  });
}
export async function currentUser(): Promise<AppUser | null> {
  const jar = await cookies();
  if (authConfig().enabled) {
    const client = await authClient();
    const { data, error } = await client!.auth.getUser();
    if (!error && data.user) {
      const u = data.user;
      return {
        id: "supabase:" + u.id,
        email: u.email ?? "",
        displayName:
          typeof u.user_metadata?.full_name === "string"
            ? u.user_metadata.full_name
            : (u.email ?? "Explorer"),
        provider: "Google / email",
      };
    }
    // A provider session must never silently become a different platform account.
    if (jar.getAll().some((c) => c.name.startsWith("sb-"))) return null;
  }
  if (jar.get("roamly-auth-provider")?.value === "supabase") return null;
  if (jar.get("roamly-signed-out")?.value === "1") return null;
  if (!(await platformAuth())) return null;
  const h = await headers();
  const id = h.get("oai-authenticated-user-id");
  const email = h.get("oai-authenticated-user-email");
  if (!id || !email) return null;
  let name = email;
  const raw = h.get("oai-authenticated-user-full-name");
  if (
    raw &&
    h.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
  ) {
    try {
      name = decodeURIComponent(raw);
    } catch {}
  }
  return { id, email, displayName: name, provider: "ChatGPT" };
}
export async function requireUser(returnTo: string) {
  const user = await currentUser();
  if (!user) redirect(authPath(returnTo));
  return user;
}
