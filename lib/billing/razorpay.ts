import { env } from "cloudflare:workers";
import { ApiError, db } from "@/lib/server/context";
const config = () => env as unknown as Record<string,string|undefined>;
// ponytail: Plus is a 30-day pass bought once via Razorpay Orders (same as Opportunity Hunter), no auto-renewal.
// Orders work with international cards and PayPal; Razorpay subscriptions support neither USD nor PayPal here.
export const PASS_DAYS = 30;
export const PRICES = { INR: { amount: 49900, label: "₹499" }, USD: { amount: 1000, label: "$10" } } as const;
export type BillingCurrency = keyof typeof PRICES;
export function billingReady() {
  const c=config();
  return c.RAZORPAY_ENABLED==="true" && !!c.RAZORPAY_KEY_ID && !!c.RAZORPAY_KEY_SECRET && !!c.RAZORPAY_WEBHOOK_SECRET;
}
/** Only a known non-Indian country gets USD; without evidence bill INR rather than overcharge. */
export function billingCurrency(country: string | null | undefined): BillingCurrency {
  const code = (country ?? "").toUpperCase();
  return config().RAZORPAY_INTERNATIONAL === "true" && !!code && code !== "IN" && code !== "XX" ? "USD" : "INR";
}
export const requestCountry = (r: Request) => (r as Request & { cf?: { country?: string } }).cf?.country ?? r.headers.get("cf-ipcountry");
async function razorpay(path:string, data:unknown) {
  if(!billingReady()) throw new ApiError(503,"Plus checkout is not open yet.");
  const c=config();
  const r=await fetch("https://api.razorpay.com/v1/"+path,{method:"POST",headers:{Authorization:"Basic "+btoa(c.RAZORPAY_KEY_ID+":"+c.RAZORPAY_KEY_SECRET),"Content-Type":"application/json"},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new ApiError(502,"Razorpay is temporarily unavailable. Please try again.");
  return r.json();
}
export type SubscriptionRow={owner:string;subscription_id:string|null;status:string;current_end:number;paid_count:number;checked_at:number};
export async function membership(owner:string) { return db().prepare("SELECT * FROM subscriptions WHERE owner=?").bind(owner).first<SubscriptionRow>(); }
export function hasPlus(row:SubscriptionRow|null) { return !!row && row.status==="active" && row.paid_count>0 && row.current_end>Math.floor(Date.now()/1000); }
export async function createOrder(owner:string,currency:BillingCurrency) {
  const {amount}=PRICES[currency];
  const order=await razorpay("orders",{amount,currency,receipt:"roamly-"+Date.now(),notes:{roamly_owner:owner,plan:"plus"}});
  if(!/^order_[a-zA-Z0-9]+$/.test(order.id??"")) throw new ApiError(502,"Could not prepare checkout. Please try again.");
  await db().prepare("INSERT INTO orders (id,owner,amount,currency) VALUES (?,?,?,?)").bind(order.id,owner,amount,currency).run();
  return {orderId:order.id as string,amount,currency,keyId:config().RAZORPAY_KEY_ID!};
}
async function hmacValid(secret:string,data:Uint8Array,signature:string) {
  if(!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify("HMAC",key,Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16)),data as BufferSource);
}
/** Checkout callback: signature = HMAC(order_id|payment_id, key secret). */
export const paymentSignatureValid=(orderId:string,paymentId:string,signature:string)=>
  billingReady() && hmacValid(config().RAZORPAY_KEY_SECRET!,new TextEncoder().encode(orderId+"|"+paymentId),signature);
/** Webhook: signature = HMAC(raw body, webhook secret). */
export const verifyWebhook=(bytes:Uint8Array,signature:string)=>billingReady() && hmacValid(config().RAZORPAY_WEBHOOK_SECRET!,bytes,signature);
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
