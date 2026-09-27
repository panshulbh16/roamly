import { rawBody,failure,ApiError } from "@/lib/server/context";
import { stripeSignatureValid,handleStripeEvent } from "@/lib/billing/stripe";
// Stripe → Developers → Webhooks: <site>/api/billing/stripe/webhook, events checkout.session.completed,
// checkout.session.async_payment_succeeded and charge.refunded (docs/stripe-setup.md).
export async function POST(r:Request){try{
  const bytes=await rawBody(r);
  if(!await stripeSignatureValid(bytes,r.headers.get("stripe-signature")??""))throw new ApiError(400,"Invalid signature.");
  let event;try{event=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,"Invalid event.");}
  await handleStripeEvent(event,new URL(r.url).origin);
  return Response.json({received:true});
}catch(e){return failure(e);}}
