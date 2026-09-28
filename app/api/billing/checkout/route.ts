import { identity,sameOrigin,failure,privateHeaders,body } from "@/lib/server/context";
import { createOrder,paymentRoute,requestCountry,launchCode } from "@/lib/billing/razorpay";
import { createStripeCheckout } from "@/lib/billing/stripe";
import { createDodoCheckout } from "@/lib/billing/dodo";
// Razorpay (India, unknown countries, and the ₹99 launch code) opens its checkout on the page; Dodo Payments or Stripe
// (buyers elsewhere, when set up) is a page of its own, so the client is sent there.
export async function POST(r:Request){try{sameOrigin(r);const user=await identity();
  const input=r.headers.get("content-type")?.includes("json")?await body(r):{}; // older pages send no body
  const route=paymentRoute(requestCountry(r)),code=launchCode(input?.code);
  const site=new URL(r.url).origin;
  if(route.provider==="dodo"&&!code)return Response.json({provider:"dodo",url:await createDodoCheckout(user.id,user.email,site)},{headers:privateHeaders});
  if(route.provider==="stripe"&&!code)return Response.json({provider:"stripe",url:await createStripeCheckout(user.id,user.email,site)},{headers:privateHeaders});
  return Response.json({provider:"razorpay",...await createOrder(user.id,route.currency,user.email,code),email:user.email},{headers:privateHeaders});}catch(e){return failure(e);}}
