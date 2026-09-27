import { db } from "@/lib/server/context";
import { unseal } from "@/lib/server/vault";
import { emailReady, escapeHtml, sendEmail } from "@/lib/server/email";
// A receipt when a pass is bought, a notice when a full refund takes it back. Only the call that actually changed the
// order sends (markOrderPaid / markOrderRefunded return true once), so the callback and webhook never send twice.
// Best effort: without Resend configured, or if sending fails, the payment or refund still stands and this only logs.
type OrderRow = { id: string; amount: number; currency: string; payment_id: string | null; email: string | null; current_end: number | null };
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount / 100);
const day = (seconds: number) => new Date(seconds * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function render(heading: string, rows: [string, string][], notes: string[], site: string) {
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;color:#222730">
  <p style="color:#72877c;font-size:12px;letter-spacing:1.5px;font-weight:700">ROAMLY PLUS</p>
  <h1 style="font-size:24px;margin:8px 0">${escapeHtml(heading)}</h1>
  <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;color:#5f6b64;border-bottom:1px solid #e3eae5">${escapeHtml(k)}</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #e3eae5">${escapeHtml(v)}</td></tr>`).join("")}</table>
  ${notes.map(n => `<p style="color:#72777f;font-size:13px">${escapeHtml(n)}</p>`).join("")}
  <a href="${escapeHtml(site)}/pricing" style="display:inline-block;background:#25664f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Open Roamly</a></div>`;
  const text = [heading, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", ...notes, "", `${site}/pricing`].join("\n");
  return { html, text };
}

async function send(orderId: string, kind: string, build: (o: OrderRow & { email: string }) => { subject: string; heading: string; rows: [string, string][]; notes: string[] }, site: string) {
  try {
    if (!emailReady()) return false;
    const o = await db().prepare("SELECT o.id,o.amount,o.currency,o.payment_id,o.email,s.current_end FROM orders o LEFT JOIN subscriptions s ON s.owner=o.owner WHERE o.id=?").bind(orderId).first<OrderRow>();
    if (!o?.email) return false; // orders from before receipts existed have no address
    const email = await unseal(o.email, "orders.email"), m = build({ ...o, email });
    await sendEmail({ to: email, subject: m.subject, ...render(m.heading, m.rows, m.notes, site) }, `Couldn't send the ${kind}.`);
    return true;
  } catch (e) {
    console.error(`${kind}_email_failed`, e instanceof Error ? e.name : "unknown");
    return false;
  }
}

export const sendReceipt = (orderId: string, site: string) => send(orderId, "receipt", o => ({
  subject: "Your Roamly Plus receipt",
  heading: "Thanks, you’re on Plus",
  rows: [["Item", "Roamly Plus · 30-day pass"], ["Amount paid", money(o.amount, o.currency)], ["Paid on", day(Date.now() / 1000)],
    ...(o.current_end ? [["Plus active until", day(o.current_end)] as [string, string]] : []), ["Order", o.id], ["Payment", o.payment_id ?? ""]],
  notes: ["The pass doesn’t renew on its own; buying again adds another 30 days.", "This is a payment receipt, not a tax invoice."],
}), site);

export const sendRefundNotice = (orderId: string, site: string) => send(orderId, "refund", o => {
  const active = !!o.current_end && o.current_end > Date.now() / 1000;
  return {
    subject: "Your Roamly Plus refund",
    heading: "Your refund has been processed",
    rows: [["Refunded", money(o.amount, o.currency)], ["Order", o.id], ["Payment", o.payment_id ?? ""], ["Plus", active ? `active until ${day(o.current_end!)}` : "ended"]],
    notes: ["The 30 days this payment bought have been removed.", "Banks usually show the refund within 5–7 working days."],
  };
}, site);
