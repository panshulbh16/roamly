import { env } from "cloudflare:workers";
import { ApiError } from "@/lib/server/context";
// Transactional email through Resend (RESEND_API_KEY, EMAIL_FROM): trip invites and Plus receipts.
const config = () => env as unknown as Record<string, string | undefined>;
export const emailReady = () => !!(config().RESEND_API_KEY && config().EMAIL_FROM);
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendEmail(message: { to: string; subject: string; html: string; text: string }, failure: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config().RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config().EMAIL_FROM, ...message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new ApiError(502, failure);
}
