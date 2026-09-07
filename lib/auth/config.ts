import { env } from "cloudflare:workers";
export function authConfig() {
  const url = typeof env.SUPABASE_URL === "string" ? env.SUPABASE_URL : "";
  const key =
    typeof env.SUPABASE_PUBLISHABLE_KEY === "string"
      ? env.SUPABASE_PUBLISHABLE_KEY
      : "";
  let valid = false;
  try {
    const u = new URL(url);
    valid =
      u.protocol === "https:" &&
      u.pathname === "/" &&
      !u.username &&
      !u.password;
  } catch {}
  return {
    url,
    key,
    enabled: valid && !!key && env.SUPABASE_AUTH_ENABLED === "true",
  };
}
export const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
