import { paymentSignatureValid,markOrderPaid } from "@/lib/billing/razorpay";
// Checkout's callback_url. Razorpay posts the result here as a form and the buyer's browser follows our redirect,
// so every payment ends back on /pricing, even when paying left the page. It is a cross-site POST, so no session
// cookie arrives: the signature is the proof and the pass goes to the order's owner. The webhook grants it too.
export async function POST(r:Request){
  let outcome="unverified";
  try{
    const form=await r.formData(),field=(k:string)=>{const v=form.get(k);return typeof v==="string"?v:"";};
    const [o,p,s]=["razorpay_order_id","razorpay_payment_id","razorpay_signature"].map(field);
    if(await paymentSignatureValid(o,p,s)){outcome="pending";await markOrderPaid(o,p);outcome="activated";}
    else if(form.has("error[code]"))outcome="failed";
  }catch(e){console.error("billing_callback_failed",e instanceof Error?e.name:"unknown");}
  return Response.redirect(new URL("/pricing?checkout="+outcome,r.url),303);
}
