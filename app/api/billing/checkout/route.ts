import { identity,sameOrigin,failure,privateHeaders,body } from "@/lib/server/context";
import { createOrder,billingCurrency,requestCountry,launchCode } from "@/lib/billing/razorpay";
export async function POST(r:Request){try{sameOrigin(r);const user=await identity();
  const input=r.headers.get("content-type")?.includes("json")?await body(r):{}; // older pages send no body
  return Response.json({...await createOrder(user.id,billingCurrency(requestCountry(r)),user.email,launchCode(input?.code)),email:user.email},{headers:privateHeaders});}catch(e){return failure(e);}}
