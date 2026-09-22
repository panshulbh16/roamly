import { identity,failure,privateHeaders } from "@/lib/server/context";
import { membership,syncSubscription,hasPlus,billingReady } from "@/lib/billing/razorpay";
export async function GET(){try{const user=await identity();const row=await membership(user.id);if(row?.subscription_id)await syncSubscription(row.subscription_id);const current=await membership(user.id);return Response.json({enabled:billingReady(),plus:hasPlus(current),status:current?.status??"none",until:current?.current_end??0},{headers:privateHeaders});}catch(e){return failure(e);}}
