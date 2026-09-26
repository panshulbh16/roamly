import { identity,failure,privateHeaders } from "@/lib/server/context";
import { membership,hasPlus,billingReady } from "@/lib/billing/razorpay";
export async function GET(){try{const user=await identity();const current=await membership(user.id);return Response.json({enabled:billingReady(),plus:hasPlus(current),until:current?.current_end??0},{headers:privateHeaders});}catch(e){return failure(e);}}
