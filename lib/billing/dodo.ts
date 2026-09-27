import { env } from "cloudflare:workers";
import { ApiError, db } from "@/lib/server/context";
import { seal } from "@/lib/server/vault";
import { PRICES, dodoReady, checkoutAttempt, markOrderPaid, markOrderRefunded } from "@/lib/billing/razorpay";
import { sendReceipt, sendRefundNotice } from "@/lib/billing/receipts";
// Buyers outside India pay through Dodo Payments' checkout page when DODO_ENABLED, DODO_API_KEY, DODO_WEBHOOK_SECRET and
// DODO_PRODUCT_ID (a $10 one-time product made in Dodo's dashboard) are set; see docs/dodo-setup.md. Dodo is the merchant
// of record, so it adds sales tax/VAT where due. The pass is the same as Razorpay's: an order row that markOrderPaid flips
// once, from the return page or the webhook, whichever comes first.
const config = () => env as unknown as Record<string, string | undefined>;
const ORDER = /^dodo_[a-f0-9]{32}$/, ID = /^[A-Za-z0-9_-]{4,100}$/;
type Payment = { payment_id?: string; status?: string; metadata?: Record<string, unknown>; product_cart?: { product_id?: string; quantity?: number }[] | null;
  checkout_session_id?: string | null; total_amount?: number; currency?: string; refund_status?: string | null; customer?: { email?: unknown } };
type Outcome = "activated" | "pending" | "failed" | "unverified";

async function dodo(path: string, body?: unknown) {
  if (!dodoReady()) throw new ApiError(503, "Plus checkout is not open yet.");
  const base = config().DODO_MODE === "test" ? "https://test.dodopayments.com/" : "https://live.dodopayments.com/";
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + config().DODO_API_KEY, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new ApiError(502, "Dodo Payments is temporarily unavailable. Please try again.");
  return r.json();
}

/** Starts a Dodo checkout for one 30-day pass and returns the address of Dodo's payment page. */
export async function createDodoCheckout(owner: string, email: string, site: string) {
  await checkoutAttempt(owner);
  const id = "dodo_" + crypto.randomUUID().replaceAll("-", "");
  const s = await dodo("checkouts", {
    product_cart: [{ product_id: config().DODO_PRODUCT_ID, quantity: 1 }],
    ...(email && { customer: { email } }),
    return_url: `${site}/api/billing/dodo/return?order=${id}`,
    cancel_url: `${site}/pricing?checkout=cancelled`,
    metadata: { roamly_order: id, roamly_owner: owner, plan: "plus" },
  });
  if (typeof s.session_id !== "string" || !ID.test(s.session_id) || typeof s.checkout_url !== "string" || !s.checkout_url.startsWith("https://"))
    throw new ApiError(502, "Could not prepare checkout. Please try again.");
  await db().prepare("INSERT INTO orders (id,owner,amount,currency,email,created_at,provider,checkout_id) VALUES (?,?,?,?,?,?,'dodo',?)")
    .bind(id, owner, PRICES.USD.amount, "USD", email ? await seal(email, "orders.email") : null, Math.floor(Date.now() / 1000), s.session_id).run();
  return s.checkout_url as string;
}

/**
 * Grants the pass for a Dodo payment that succeeded for our product and one of our orders (named in its metadata, and
 * made by that order's checkout). The order then records what was really charged, tax and currency included.
 */
async function settle(p: Payment, site: string, expected?: string): Promise<Outcome> {
  const id = p.metadata?.roamly_order;
  if (typeof id !== "string" || !ORDER.test(id) || (expected && id !== expected)) return "unverified";
  const order = await db().prepare("SELECT checkout_id FROM orders WHERE id=? AND provider='dodo'").bind(id).first<{ checkout_id: string | null }>();
  const ours = p.product_cart?.length === 1 && p.product_cart[0].product_id === config().DODO_PRODUCT_ID && p.product_cart[0].quantity === 1;
  if (!order || !ours || (p.checkout_session_id && p.checkout_session_id !== order.checkout_id)) return "unverified";
  if (p.status === "failed" || p.status === "cancelled") return "failed";
  if (p.status !== "succeeded" || typeof p.payment_id !== "string" || !ID.test(p.payment_id)) return "pending";
  if (Number.isInteger(p.total_amount) && typeof p.currency === "string" && /^[A-Z]{3}$/.test(p.currency))
    await db().prepare("UPDATE orders SET amount=?,currency=? WHERE id=? AND status='created'").bind(p.total_amount, p.currency, id).run();
  if (await markOrderPaid(id, p.payment_id)) await sendReceipt(id, site, p.customer?.email);
  return "activated";
}

/**
 * Where Dodo sends the buyer after paying. The pass is granted only once Dodo itself says the payment succeeded: the
 * payment_id Dodo adds to the address is looked up with Dodo (and must belong to this order); without one, the order's
 * checkout session is asked for its payment.
 */
export async function settleDodoReturn(order: string, paymentId: string | null, site: string): Promise<Outcome> {
  if (!ORDER.test(order)) return "unverified";
  const row = await db().prepare("SELECT checkout_id FROM orders WHERE id=? AND provider='dodo'").bind(order).first<{ checkout_id: string | null }>();
  if (!row?.checkout_id) return "unverified";
  let payment = paymentId && ID.test(paymentId) ? paymentId : null;
  if (!payment) {
    const session = await dodo("checkouts/" + encodeURIComponent(row.checkout_id));
    if (typeof session?.payment_id !== "string" || !ID.test(session.payment_id)) return "pending";
    payment = session.payment_id as string;
  }
  return settle(await dodo("payments/" + encodeURIComponent(payment)), site, order);
}

/** Standard Webhooks: webhook-signature is "v1,<base64 HMAC-SHA256 of 'id.timestamp.body'>" (several, space-separated). */
export async function dodoSignatureValid(bytes: Uint8Array, headers: Headers, now = Date.now() / 1000) {
  if (!dodoReady()) return false;
  const id = headers.get("webhook-id") ?? "", ts = headers.get("webhook-timestamp") ?? "", given = headers.get("webhook-signature") ?? "";
  if (!id || !/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > 300) return false;
  let secret: Uint8Array;
  try { secret = Uint8Array.from(atob(config().DODO_WEBHOOK_SECRET!.replace(/^whsec_/, "")), c => c.charCodeAt(0)); } catch { return false; }
  if (!secret.length) return false;
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new Uint8Array([...new TextEncoder().encode(`${id}.${ts}.`), ...bytes]);
  for (const part of given.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    let raw: Uint8Array;
    try { raw = Uint8Array.from(atob(sig), c => c.charCodeAt(0)); } catch { continue; }
    if (raw.length === 32 && await crypto.subtle.verify("HMAC", key, raw as BufferSource, signed)) return true;
  }
  return false;
}

/**
 * Webhook events (docs/dodo-setup.md): payment.succeeded grants the pass (for buyers who never come back to the site);
 * refund.succeeded takes back the 30 days once the payment is fully refunded. Partial refunds leave the pass alone.
 */
export async function handleDodoEvent(event: { type?: string; data?: Record<string, unknown> }, site: string) {
  const d = event?.data ?? {};
  if (event?.type === "payment.succeeded") await settle(d as Payment, site);
  if (event?.type === "refund.succeeded" && typeof d.payment_id === "string" && ID.test(d.payment_id)) {
    const order = await db().prepare("SELECT id FROM orders WHERE provider='dodo' AND payment_id=?").bind(d.payment_id).first<{ id: string }>();
    if (!order) return;
    const full = d.is_partial === false || (await dodo("payments/" + encodeURIComponent(d.payment_id)) as Payment).refund_status === "full";
    if (full && await markOrderRefunded(order.id, d.payment_id)) await sendRefundNotice(order.id, site, (d.customer as { email?: unknown } | undefined)?.email);
  }
}
