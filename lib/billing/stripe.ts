import { env } from "cloudflare:workers";
import { ApiError, db } from "@/lib/server/context";
import { seal } from "@/lib/server/vault";
import { PRICES, stripeReady, checkoutAttempt, hmacValid, markOrderPaid, markOrderRefunded } from "@/lib/billing/razorpay";
import { sendReceipt, sendRefundNotice } from "@/lib/billing/receipts";
// Buyers outside India pay through Stripe Checkout (Stripe's own page), when STRIPE_ENABLED, STRIPE_SECRET_KEY and
// STRIPE_WEBHOOK_SECRET are set; see docs/stripe-setup.md. The pass itself is the same as Razorpay's: an order row
// (id = the Checkout Session) that markOrderPaid flips once, from the return page or the webhook, whichever is first.
const config = () => env as unknown as Record<string, string | undefined>;
const SESSION = /^cs_(test|live)_[A-Za-z0-9]+$/;
type Session = { id?: string; object?: string; status?: string; payment_status?: string; amount_total?: number; currency?: string; payment_intent?: unknown; customer_details?: { email?: unknown } };

async function stripe(path: string, form?: Record<string, string>) {
  if (!stripeReady()) throw new ApiError(503, "Plus checkout is not open yet.");
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: form ? "POST" : "GET",
    headers: { Authorization: "Bearer " + config().STRIPE_SECRET_KEY, ...(form && { "Content-Type": "application/x-www-form-urlencoded" }) },
    body: form && new URLSearchParams(form), signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new ApiError(502, "Stripe is temporarily unavailable. Please try again.");
  return r.json();
}

/** Starts a $10 Stripe Checkout for one 30-day pass and returns the address of Stripe's payment page. */
export async function createStripeCheckout(owner: string, email: string, site: string) {
  const { amount } = PRICES.USD;
  await checkoutAttempt(owner);
  const s = await stripe("checkout/sessions", {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": "Roamly Plus · 30-day pass",
    success_url: site + "/api/billing/stripe/return?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: site + "/pricing?checkout=cancelled",
    "metadata[roamly_owner]": owner, "metadata[plan]": "plus",
    "payment_intent_data[metadata][roamly_owner]": owner,
    ...(email && { customer_email: email }),
  });
  if (!SESSION.test(s.id ?? "") || typeof s.url !== "string" || !s.url.startsWith("https://checkout.stripe.com/"))
    throw new ApiError(502, "Could not prepare checkout. Please try again.");
  await db().prepare("INSERT INTO orders (id,owner,amount,currency,email,created_at,provider) VALUES (?,?,?,?,?,?,'stripe')")
    .bind(s.id, owner, amount, "USD", email ? await seal(email, "orders.email") : null, Math.floor(Date.now() / 1000)).run();
  return s.url as string;
}

/**
 * Grants the pass for a Checkout Session Stripe reports as paid, if it is one of ours and for the amount we asked.
 * "pending" is a completed checkout whose payment is still clearing (the webhook finishes it).
 */
async function settle(s: Session, site: string): Promise<"activated" | "pending" | "unverified"> {
  if (s.object !== "checkout.session" || !SESSION.test(s.id ?? "")) return "unverified";
  const order = await db().prepare("SELECT amount,currency FROM orders WHERE id=? AND provider='stripe'").bind(s.id).first<{ amount: number; currency: string }>();
  if (!order || s.amount_total !== order.amount || s.currency !== order.currency.toLowerCase()) return "unverified";
  if (s.payment_status !== "paid" || typeof s.payment_intent !== "string") return s.status === "complete" ? "pending" : "unverified";
  if (await markOrderPaid(s.id!, s.payment_intent)) await sendReceipt(s.id!, site, s.customer_details?.email);
  return "activated";
}

/** The page Stripe sends buyers back to: asks Stripe itself about the session (the address alone proves nothing). */
export async function settleStripeReturn(sessionId: string, site: string) {
  if (!SESSION.test(sessionId)) return "unverified";
  const known = await db().prepare("SELECT 1 FROM orders WHERE id=? AND provider='stripe'").bind(sessionId).first();
  return known ? settle(await stripe("checkout/sessions/" + sessionId), site) : "unverified";
}

/** Stripe-Signature: t=<unix time>,v1=<HMAC-SHA256 of "t.body">[,v1=…]; stale ones (over 5 minutes) are refused. */
export async function stripeSignatureValid(bytes: Uint8Array, header: string, now = Date.now() / 1000) {
  if (!stripeReady()) return false;
  const parts = header.split(","), t = Number(parts.find(p => p.startsWith("t="))?.slice(2));
  if (!Number.isInteger(t) || Math.abs(now - t) > 300) return false;
  const signed = new Uint8Array([...new TextEncoder().encode(t + "."), ...bytes]);
  for (const p of parts) if (p.startsWith("v1=") && await hmacValid(config().STRIPE_WEBHOOK_SECRET!, signed, p.slice(3))) return true;
  return false;
}

/**
 * Webhook events (docs/stripe-setup.md): checkout.session.completed and .async_payment_succeeded grant the pass (a
 * backstop for buyers who close the tab before coming back); charge.refunded takes back the 30 days of a fully
 * refunded payment, like Razorpay's refund.processed. Partial refunds leave the pass alone.
 */
export async function handleStripeEvent(event: { type?: string; data?: { object?: Record<string, unknown> } }, site: string) {
  const o = event?.data?.object ?? {};
  if (event?.type === "checkout.session.completed" || event?.type === "checkout.session.async_payment_succeeded") await settle(o as Session, site);
  if (event?.type === "charge.refunded" && o.object === "charge" && typeof o.payment_intent === "string") {
    const full = o.refunded === true || (typeof o.amount === "number" && typeof o.amount_refunded === "number" && o.amount_refunded >= o.amount);
    const order = full ? await db().prepare("SELECT id FROM orders WHERE provider='stripe' AND payment_id=?").bind(o.payment_intent).first<{ id: string }>() : null;
    if (order && await markOrderRefunded(order.id, o.payment_intent)) await sendRefundNotice(order.id, site, (o.billing_details as { email?: unknown } | undefined)?.email);
  }
}
