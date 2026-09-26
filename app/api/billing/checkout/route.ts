import { identity,sameOrigin,failure,privateHeaders } from "@/lib/server/context";
import { createOrder,billingCurrency,requestCountry } from "@/lib/billing/razorpay";
export async function POST(r:Request){try{sameOrigin(r);const user=await identity();return Response.json({...await createOrder(user.id,billingCurrency(requestCountry(r))),email:user.email},{headers:privateHeaders});}catch(e){return failure(e);}}
