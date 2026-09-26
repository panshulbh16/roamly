import { identity,sameOrigin,failure,privateHeaders,ApiError } from "@/lib/server/context";
import { paymentSignatureValid,markOrderPaid } from "@/lib/billing/razorpay";
// Checkout's success callback. The webhook grants the same pass if the tab closes before this runs.
export async function POST(r:Request){try{sameOrigin(r);await identity();
  const b=await r.json().catch(()=>null) as {orderId?:unknown;paymentId?:unknown;signature?:unknown}|null;
  const [o,p,s]=[b?.orderId,b?.paymentId,b?.signature].map(v=>typeof v==="string"?v:"");
  if(!await paymentSignatureValid(o,p,s))throw new ApiError(400,"We couldn't verify that payment. If you were charged, contact support and we'll sort it out.");
  await markOrderPaid(o,p); // grants to the order's owner, not the caller
  return Response.json({ok:true},{headers:privateHeaders});}catch(e){return failure(e);}}
