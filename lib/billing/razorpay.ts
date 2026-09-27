import { env } from "cloudflare:workers";
import { ApiError, db } from "@/lib/server/context";
import { seal } from "@/lib/server/vault";
const config = () => env as unknown as Record<string,string|undefined>;
// ponytail: Plus is a 30-day pass bought once via Razorpay Orders (same as Opportunity Hunter), no auto-renewal.
// Orders work with international cards and PayPal; Razorpay subscriptions support neither USD nor PayPal here.
// When Stripe is set up (lib/billing/stripe.ts), buyers outside India pay through Stripe Checkout instead.
export const PASS_DAYS = 30;
export const PRICES = { INR: { amount: 49900, label: "₹499" }, USD: { amount: 1000, label: "$10" } } as const;
/**
 * Launch offer: any account can use the code once for a 30-day pass at ₹99, until 200 accounts have. A place is held
 * by paying (a refund doesn't give it back) or, for 30 minutes, by an open checkout, so the 200 can't be oversold by
 * people paying at the same moment. Counted per account, so opening several checkouts holds one place.
 */
export const LAUNCH = { code: "ROAMLY99", amount: 9900, currency: "INR", label: "₹99", places: 200, holdSeconds: 30 * 60 } as const;
export const launchCode = (v: unknown) => typeof v === "string" ? v.trim().toUpperCase().slice(0, 40) : "";
const USED = "coupon=? AND owner=? AND status IN ('paid','refunded')";
const HELD = "SELECT count(DISTINCT owner) FROM orders WHERE coupon=? AND owner<>? AND (status IN ('paid','refunded') OR (status='created' AND created_at>?))";
export async function launchOffer(owner: string, code: string) {
  if (code !== LAUNCH.code) throw new ApiError(400, "That code isn’t valid.");
  const since = Math.floor(Date.now() / 1000) - LAUNCH.holdSeconds;
  const row = await db().prepare(`SELECT EXISTS(SELECT 1 FROM orders WHERE ${USED}) used, (${HELD}) held`)
    .bind(code, owner, code, owner, since).first<{ used: number; held: number }>();
  if (row?.used) throw new ApiError(409, "You’ve already used this code.");
  const left = LAUNCH.places - (row?.held ?? 0);
  if (left <= 0) throw new ApiError(409, "All 200 launch places have been taken.");
  return { code, amount: LAUNCH.amount, currency: LAUNCH.currency, label: LAUNCH.label, left, places: LAUNCH.places };
}
export type BillingCurrency = keyof typeof PRICES;
export function razorpayReady() {
  const c=config();
  return c.RAZORPAY_ENABLED==="true" && !!c.RAZORPAY_KEY_ID && !!c.RAZORPAY_KEY_SECRET && !!c.RAZORPAY_WEBHOOK_SECRET;
}
export function stripeReady() {
  const c=config();
  return c.STRIPE_ENABLED==="true" && !!c.STRIPE_SECRET_KEY && !!c.STRIPE_WEBHOOK_SECRET;
}
/** Plus can be bought (and counts) when either payment provider is set up. */
export const billingReady = () => razorpayReady() || stripeReady();
const abroad = (country: string | null | undefined) => { const code = (country ?? "").toUpperCase(); return !!code && code !== "IN" && code !== "XX"; };
/** Only a known non-Indian country gets USD; without evidence bill INR rather than overcharge. */
export function billingCurrency(country: string | null | undefined): BillingCurrency {
  return config().RAZORPAY_INTERNATIONAL === "true" && abroad(country) ? "USD" : "INR";
}
export type PaymentRoute = { provider: "razorpay" | "stripe"; currency: BillingCurrency };
/** Stripe (in USD) for a known non-Indian country when it's set up, or for everyone if only Stripe is; otherwise Razorpay. */
export function paymentRoute(country: string | null | undefined): PaymentRoute {
  if (stripeReady() && (abroad(country) || !razorpayReady())) return { provider: "stripe", currency: "USD" };
  return { provider: "razorpay", currency: billingCurrency(country) };
}
/** Each checkout creates an order at the provider; a daily cap keeps a script from flooding the account with them. */
export async function checkoutAttempt(owner: string) {
  const attempt=await db().prepare("INSERT INTO usage (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<20 RETURNING count")
    .bind(`checkout:${owner}:${new Date().toISOString().slice(0,10)}`).first();
  if(!attempt) throw new ApiError(429,"Too many checkout attempts today. Please try again tomorrow.");
}
// The header first, as the pricing page (which only sees headers) reads it: the price shown is the price charged.
export const requestCountry = (r: Request) => r.headers.get("cf-ipcountry") ?? (r as Request & { cf?: { country?: string } }).cf?.country;
async function razorpay(path:string, data:unknown) {
  if(!razorpayReady()) throw new ApiError(503,"Plus checkout is not open yet.");
  const c=config();
  const r=await fetch("https://api.razorpay.com/v1/"+path,{method:"POST",headers:{Authorization:"Basic "+btoa(c.RAZORPAY_KEY_ID+":"+c.RAZORPAY_KEY_SECRET),"Content-Type":"application/json"},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new ApiError(502,"Razorpay is temporarily unavailable. Please try again.");
  return r.json();
}
export type SubscriptionRow={owner:string;subscription_id:string|null;status:string;current_end:number;paid_count:number;checked_at:number};
export async function membership(owner:string) { return db().prepare("SELECT * FROM subscriptions WHERE owner=?").bind(owner).first<SubscriptionRow>(); }
export function hasPlus(row:SubscriptionRow|null) { return !!row && row.status==="active" && row.paid_count>0 && row.current_end>Math.floor(Date.now()/1000); }
export async function createOrder(owner:string,billing:BillingCurrency,email:string,code="") {
  const offer=code?await launchOffer(owner,code):null,now=Math.floor(Date.now()/1000);
  const {amount,currency}=offer??{amount:PRICES[billing].amount,currency:billing};
  if(offer){ // reopening checkout reuses the order already holding this account's place
    const open=await db().prepare("SELECT id FROM orders WHERE coupon=? AND owner=? AND status='created' AND created_at>? ORDER BY created_at DESC LIMIT 1")
      .bind(offer.code,owner,now-LAUNCH.holdSeconds).first<{id:string}>();
    if(open) return {orderId:open.id,amount,currency,keyId:config().RAZORPAY_KEY_ID!};
  }
  await checkoutAttempt(owner);
  const order=await razorpay("orders",{amount,currency,receipt:"roamly-"+Date.now(),notes:{roamly_owner:owner,plan:"plus",...(offer?{coupon:offer.code}:{})}});
  if(!/^order_[a-zA-Z0-9]+$/.test(order.id??"")) throw new ApiError(502,"Could not prepare checkout. Please try again.");
  const values=[order.id,owner,amount,currency,email?await seal(email,"orders.email"):null,offer?.code??null,now];
  const insert="INSERT INTO orders (id,owner,amount,currency,email,coupon,created_at) ";
  // With the code, the place is re-checked in the same statement, so two people paying for the 200th place can't both get it.
  const saved=offer
    ?await db().prepare(insert+`SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM orders WHERE ${USED}) AND (${HELD})<?`)
      .bind(...values,offer.code,owner,offer.code,owner,now-LAUNCH.holdSeconds,LAUNCH.places).run()
    :await db().prepare(insert+"VALUES (?,?,?,?,?,?,?)").bind(...values).run();
  if(!Number(saved.meta.changes??0)) throw new ApiError(409,"All 200 launch places have just been taken.");
  return {orderId:order.id as string,amount,currency,keyId:config().RAZORPAY_KEY_ID!};
}
export async function hmacValid(secret:string,data:Uint8Array,signature:string) {
  if(!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify("HMAC",key,Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16)),data as BufferSource);
}
/** Checkout callback: signature = HMAC(order_id|payment_id, key secret). */
export const paymentSignatureValid=(orderId:string,paymentId:string,signature:string)=>
  razorpayReady() && hmacValid(config().RAZORPAY_KEY_SECRET!,new TextEncoder().encode(orderId+"|"+paymentId),signature);
/** Webhook: signature = HMAC(raw body, webhook secret). */
export const verifyWebhook=(bytes:Uint8Array,signature:string)=>razorpayReady() && hmacValid(config().RAZORPAY_WEBHOOK_SECRET!,bytes,signature);
/**
 * Grants the pass. Checkout callback and webhook both land here, so only the call that flips the order
 * created -> paid counts (one D1 batch = one transaction). Buying again before the pass ends stacks on top.
 */
export async function markOrderPaid(orderId:string,paymentId:string) {
  const now=Math.floor(Date.now()/1000),days=PASS_DAYS*86400;
  const [,flip]=await db().batch([
    db().prepare(`INSERT INTO subscriptions (owner,subscription_id,status,current_end,paid_count,checked_at)
      SELECT owner,id,'active',?+?,1,? FROM orders WHERE id=? AND status='created'
      ON CONFLICT(owner) DO UPDATE SET subscription_id=excluded.subscription_id,status='active',
        current_end=max(subscriptions.current_end,?)+?,paid_count=subscriptions.paid_count+1,checked_at=excluded.checked_at`)
      .bind(now,days,now,orderId,now,days),
    db().prepare("UPDATE orders SET status='paid',payment_id=? WHERE id=? AND status='created'").bind(paymentId,orderId),
  ]);
  return Number(flip.meta.changes??0)>0;
}
/**
 * Takes back the 30 days a fully refunded order bought (webhook refund.processed). Like markOrderPaid, only the call
 * that flips the order paid -> refunded counts, so a replayed event can't take more. Other passes stay: someone who
 * bought twice and refunds one keeps the other 30 days.
 */
export async function markOrderRefunded(orderId:string,paymentId:string) {
  const now=Math.floor(Date.now()/1000),days=PASS_DAYS*86400;
  const [,flip]=await db().batch([
    db().prepare(`UPDATE subscriptions SET current_end=current_end-?,paid_count=max(paid_count-1,0),checked_at=?
      WHERE owner=(SELECT owner FROM orders WHERE id=? AND payment_id=? AND status='paid')`).bind(days,now,orderId,paymentId),
    db().prepare("UPDATE orders SET status='refunded' WHERE id=? AND payment_id=? AND status='paid'").bind(orderId,paymentId),
  ]);
  return Number(flip.meta.changes??0)>0;
}
