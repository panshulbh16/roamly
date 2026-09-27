import { settleDodoReturn } from "@/lib/billing/dodo";
// Dodo sends the buyer here after paying (return_url, with ?payment_id=… added). The pass is granted only if Dodo itself
// confirms the payment; then, as with Razorpay's callback, the buyer lands on /pricing with the outcome.
export async function GET(r:Request){
  let outcome="unverified";
  try{const url=new URL(r.url);outcome=await settleDodoReturn(url.searchParams.get("order")??"",url.searchParams.get("payment_id"),url.origin);}
  catch(e){console.error("dodo_return_failed",e instanceof Error?e.name:"unknown");}
  return Response.redirect(new URL("/pricing?checkout="+outcome,r.url),303);
}
