import { z } from "zod";
import { authClient } from "./server";
import { ApiError, db } from "@/lib/server/context";
export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export async function requiredClient() {
  const c = await authClient(true);
  if (!c)
    throw new ApiError(
      503,
      "Google and email sign-in are awaiting connection. Your existing ChatGPT account remains available.",
    );
  return c;
}
export async function authRateLimit(email: string, action: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email),
  );
  const id = Array.from(new Uint8Array(hash), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  const bucket = new Date().toISOString().slice(0, 13);
  const max = action === "send" ? 5 : 12;
  const row = await db()
    .prepare(
      "INSERT INTO usage (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count",
    )
    .bind(`auth:${action}:${id}:${bucket}`, max)
    .first();
  if (!row)
    throw new ApiError(
      429,
      "Too many attempts. Please wait before trying again.",
    );
}
