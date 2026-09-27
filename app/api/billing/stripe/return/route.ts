import { settleStripeReturn } from "@/lib/billing/stripe";
// Stripe Checkout sends the buyer here after paying (success_url). The pass is granted only if Stripe itself confirms
// the session is paid; then, as with Razorpay's callback, the buyer lands on /pricing with the outcome.
export async function GET(r:Request){
  let outcome="unverified";
  try{const url=new URL(r.url);outcome=await settleStripeReturn(url.searchParams.get("session_id")??"",url.origin);}
  catch(e){console.error("stripe_return_failed",e instanceof Error?e.name:"unknown");}
  return Response.redirect(new URL("/pricing?checkout="+outcome,r.url),303);
}
