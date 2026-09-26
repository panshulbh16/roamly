import { env } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";
import { authConfig } from "@/lib/auth/config";
import { ApiError, db } from "@/lib/server/context";
import { upcoming } from "@/lib/trips/together";

const config = () => env as unknown as Record<string, string | undefined>;
export const INVITE_DAYS = 14;

export async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const invitesReady = () => !!(config().RESEND_API_KEY && config().EMAIL_FROM && config().SUPABASE_SERVICE_ROLE_KEY && authConfig().enabled);

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendInviteEmail(to: string, trip: { title: string; hostName: string; city: string; destination: string; startDate: string }, link: string) {
  const date = new Date(trip.startDate + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const [title, host, route] = [escape(trip.title), escape(trip.hostName), escape(`${trip.city} → ${trip.destination}`)];
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;color:#222730">
  <p style="color:#72877c;font-size:12px;letter-spacing:1.5px;font-weight:700">ROAMLY · TRAVEL TOGETHER</p>
  <h1 style="font-size:24px;margin:8px 0">${host} invited you on a trip</h1>
  <div style="border:1px solid #e3eae5;border-radius:12px;padding:16px 18px;margin:18px 0;background:#f6faf7">
    <strong style="font-size:17px">${title}</strong><br><span style="color:#5f6b64">${route} · ${date}</span></div>
  <a href="${escape(link)}" style="display:inline-block;background:#25664f;color:#fff;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:600">Join the trip</a>
  <p style="color:#72777f;font-size:13px;margin-top:22px">The button signs you in to Roamly with this email address and adds you to the trip. It works once and expires in ${INVITE_DAYS} days. If you weren't expecting this, you can ignore it.</p></div>`;
  const text = `${trip.hostName} invited you on a trip: ${trip.title} (${trip.city} → ${trip.destination}, ${date}).\n\nJoin the trip: ${link}\n\nThe link signs you in to Roamly with this email address and adds you to the trip. It works once and expires in ${INVITE_DAYS} days.`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config().RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config().EMAIL_FROM, to, subject: `${trip.hostName} invited you: ${trip.title}`, html, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new ApiError(502, `Couldn't send the invite to ${to}. Try again in a minute.`);
}

/**
 * Signs the browser in as `email` without the person typing anything: the service role mints a one-time
 * Supabase link server-side and the cookie-writing client redeems it at once (creating the account if needed).
 * Only call this after proving the caller holds a valid, unused invite for exactly that email.
 */
export async function signInAs(email: string, client: { auth: { verifyOtp: (p: { token_hash: string; type: "magiclink" | "invite" | "signup" | "email" }) => Promise<{ data: { user: { id: string } | null }; error: unknown }> } }) {
  const admin = createClient(authConfig().url, config().SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) link = await admin.auth.admin.generateLink({ type: "invite", email });
  const props = link.data?.properties;
  if (link.error || !props?.hashed_token) throw new ApiError(502, "Couldn't sign you in right now. Please try the link again.");
  const { data, error } = await client.auth.verifyOtp({ token_hash: props.hashed_token, type: (props.verification_type as "magiclink" | "invite" | "signup") ?? "magiclink" });
  if (error || !data.user) throw new ApiError(502, "Couldn't sign you in right now. Please try the link again.");
  return "supabase:" + data.user.id;
}

type Invite = { id: string; email: string; status: string; expires_at: number; trip: string; owner: string; trip_status: string; start_date: string };
export async function findInvite(token: string) {
  return db().prepare(`SELECT i.id,i.email,i.status,i.expires_at,o.id trip,o.owner,o.status trip_status,o.start_date,o.payload
    FROM outing_invites i JOIN outings o ON o.id=i.trip_id WHERE i.token_hash=?`).bind(await sha256(token)).first<Invite & { payload: string }>();
}
export function inviteProblem(invite: Invite | null) {
  if (!invite) return "This invite link isn’t valid. Check you used the whole link from the email.";
  if (invite.status !== "sent") return "This invite has already been used. Sign in with the invited email to see the trip.";
  if (invite.expires_at <= Math.floor(Date.now() / 1000)) return "This invite has expired. Ask the host to send a new one.";
  if (!["open", "closed"].includes(invite.trip_status) || !upcoming(invite.start_date)) return "This trip is no longer available.";
  return null;
}
