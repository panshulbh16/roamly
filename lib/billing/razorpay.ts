import { env } from "cloudflare:workers";
import { z } from "zod";
import { ApiError, db } from "@/lib/server/context";
const config = () => env as unknown as Record<string,string|undefined>;
export function billingReady() {
  const c=config();
  return c.RAZORPAY_ENABLED==="true" && !!c.RAZORPAY_KEY_ID && !!c.RAZORPAY_KEY_SECRET && !!c.RAZORPAY_PLAN_ID && !!c.RAZORPAY_WEBHOOK_SECRET;
}
// ₹499 in India, $10 elsewhere once RAZORPAY_INTERNATIONAL and a USD plan are configured.
export const PRICES = { INR: { amount: 49900, label: "₹499" }, USD: { amount: 1000, label: "$10" } } as const;
export type BillingCurrency = keyof typeof PRICES;
const planId = (currency: BillingCurrency) => currency === "USD" ? config().RAZORPAY_PLAN_ID_USD : config().RAZORPAY_PLAN_ID;
/** Only a known non-Indian country gets USD; without evidence bill INR rather than overcharge. */
export function billingCurrency(country: string | null | undefined): BillingCurrency {
  const c = config(), code = (country ?? "").toUpperCase();
  return c.RAZORPAY_INTERNATIONAL === "true" && !!c.RAZORPAY_PLAN_ID_USD && !!code && code !== "IN" && code !== "XX" ? "USD" : "INR";
}
export const requestCountry = (r: Request) => (r as Request & { cf?: { country?: string } }).cf?.country ?? r.headers.get("cf-ipcountry");
export async function razorpay(path:string, data?:unknown) {
  if(!billingReady()) throw new ApiError(503,"Plus checkout is not open yet.");
  const c=config();
  const r=await fetch("https://api.razorpay.com/v1/"+path,{method:data?"POST":"GET",headers:{Authorization:"Basic "+btoa(c.RAZORPAY_KEY_ID+":"+c.RAZORPAY_KEY_SECRET),"Content-Type":"application/json"},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new ApiError(502,"Razorpay is temporarily unavailable. Please try again.");
  return r.json();
}
const subscriptionSchema = z.object({id:z.string().regex(/^sub_[a-zA-Z0-9]+$/),plan_id:z.string(),status:z.string(),current_end:z.number().nullable(),paid_count:z.number().int().min(0),quantity:z.number(),short_url:z.string().optional(),has_scheduled_changes:z.boolean().optional(),change_scheduled_at:z.number().nullable().optional()});
export type SubscriptionRow={owner:string;subscription_id:string|null;status:string;current_end:number;paid_count:number;checked_at:number};
export async function membership(owner:string) { return db().prepare("SELECT * FROM subscriptions WHERE owner=?").bind(owner).first<SubscriptionRow>(); }
export function hasPlus(row:SubscriptionRow|null) { return !!row && row.status==="active" && row.paid_count>0 && row.current_end>Math.floor(Date.now()/1000); }
export async function syncSubscription(id:string) {
  if(!/^sub_[a-zA-Z0-9]+$/.test(id)) throw new ApiError(400,"Invalid subscription.");
  const checkedAt=Date.now();
  const parsed=subscriptionSchema.safeParse(await razorpay("subscriptions/"+id));
  if(!parsed.success || parsed.data.id!==id || ![planId("INR"),planId("USD")].includes(parsed.data.plan_id) || parsed.data.quantity!==1) throw new ApiError(502,"Could not verify your subscription.");
  const s=parsed.data;
  await db().prepare("UPDATE subscriptions SET status=?,current_end=?,paid_count=?,checked_at=? WHERE subscription_id=? AND checked_at<=?").bind(s.status,s.current_end??0,s.paid_count,checkedAt,id,checkedAt).run();
  return s;
}
export function checkoutUrl(value:unknown) {
  if(typeof value!=="string") throw new ApiError(502,"Checkout link unavailable.");
  const url=new URL(value);
  if(url.protocol!=="https:" || url.hostname!=="rzp.io" || url.username || url.password) throw new ApiError(502,"Checkout link unavailable.");
  return url.href;
}
export async function createCheckout(owner:string,currency:BillingCurrency="INR") {
  if(!billingReady()) throw new ApiError(503,"Plus checkout is not open yet.");
  const existing=await membership(owner);
  if(existing?.subscription_id) {
    const s=await syncSubscription(existing.subscription_id);
    if(["created","authenticated"].includes(s.status)) return checkoutUrl(s.short_url);
    if(!["cancelled","completed","expired"].includes(s.status)) throw new ApiError(409,"You already have a subscription. Refresh its status or cancel renewal below.");
    await db().prepare("DELETE FROM subscriptions WHERE owner=? AND subscription_id=?").bind(owner,existing.subscription_id).run();
  }
  const id=planId(currency)!;
  const plan=await razorpay("plans/"+encodeURIComponent(id));
  if(plan.id!==id || plan.period!=="monthly" || plan.interval!==1 || plan.item?.amount!==PRICES[currency].amount || plan.item?.currency!==currency) throw new ApiError(503,`The ${PRICES[currency].label} monthly plan has not been configured correctly.`);
  const lock=await db().prepare("INSERT INTO subscriptions (owner,status) VALUES (?,'creating') ON CONFLICT(owner) DO NOTHING RETURNING owner").bind(owner).first();
  if(!lock) throw new ApiError(409,"Checkout is being prepared or needs review. Please refresh membership before trying again.");
  // Never retry an ambiguous create: it may already exist at the payment provider.
  const result=await razorpay("subscriptions",{plan_id:id,total_count:120,quantity:1,customer_notify:true,notes:{roamly_owner:owner}});
  if(!/^sub_[a-zA-Z0-9]+$/.test(result.id??"")) throw new ApiError(502,"Could not prepare checkout. Please contact support before retrying.");
  await db().prepare("UPDATE subscriptions SET subscription_id=?,status='created' WHERE owner=? AND subscription_id IS NULL").bind(result.id,owner).run();
  return checkoutUrl(result.short_url);
}
export async function verifyWebhook(bytes:Uint8Array,signature:string) {
  if(!billingReady() || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(config().RAZORPAY_WEBHOOK_SECRET!),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const digest=Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16));
  return crypto.subtle.verify("HMAC",key,digest,bytes as BufferSource);
}
