import { identity,sameOrigin,failure,privateHeaders } from "@/lib/server/context";
import { createCheckout } from "@/lib/billing/razorpay";
export async function POST(r:Request){try{sameOrigin(r);const user=await identity();return Response.json({url:await createCheckout(user.id)},{headers:privateHeaders});}catch(e){return failure(e);}}
