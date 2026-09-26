import { rawBody,failure,ApiError } from "@/lib/server/context";
import { verifyWebhook,markOrderPaid } from "@/lib/billing/razorpay";
// Razorpay → Webhooks: <site>/api/billing/webhook, event "order.paid". Backstop for buyers who close the tab before the callback.
export async function POST(r:Request){try{
  const bytes=await rawBody(r);
  if(!await verifyWebhook(bytes,r.headers.get("x-razorpay-signature")??""))throw new ApiError(401,"Invalid signature.");
  let event;try{event=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,"Invalid event.");}
  const order=event?.payload?.order?.entity?.id,payment=event?.payload?.payment?.entity?.id;
  if(event?.event==="order.paid"&&typeof order==="string"&&typeof payment==="string")await markOrderPaid(order,payment);
  return Response.json({received:true});
}catch(e){return failure(e);}}
