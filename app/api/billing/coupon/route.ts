import { identity,sameOrigin,failure,privateHeaders,body,ApiError } from "@/lib/server/context";
import { billingReady,launchOffer,launchCode } from "@/lib/billing/razorpay";
// Checks a launch code before checkout: the price it gives and how many places are left.
export async function POST(r:Request){try{sameOrigin(r);const user=await identity();
  if(!billingReady())throw new ApiError(503,"Plus checkout is not open yet.");
  return Response.json(await launchOffer(user.id,launchCode((await body(r))?.code)),{headers:privateHeaders});}catch(e){return failure(e);}}
