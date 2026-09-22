import { rawBody,db,failure,ApiError } from "@/lib/server/context";
import { verifyWebhook,syncSubscription } from "@/lib/billing/razorpay";
export async function POST(r:Request){try{
  const bytes=await rawBody(r);
  if(!await verifyWebhook(bytes,r.headers.get("x-razorpay-signature")??""))throw new ApiError(401,"Invalid signature.");
  let event;try{event=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,"Invalid event.");}
  const id=event?.payload?.subscription?.entity?.id;
  if(typeof id==="string"&&/^sub_[a-zA-Z0-9]+$/.test(id)){
    const row=await db().prepare("SELECT owner FROM subscriptions WHERE subscription_id=?").bind(id).first();
    // Fetch canonical state: duplicate/out-of-order events cannot grant access from stale payloads.
    if(row)await syncSubscription(id);
  }
  return Response.json({received:true});
}catch(e){return failure(e);}}
