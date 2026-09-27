import { rawBody,failure,ApiError } from "@/lib/server/context";
import { verifyWebhook,markOrderPaid,markOrderRefunded } from "@/lib/billing/razorpay";
import { sendReceipt,sendRefundNotice } from "@/lib/billing/receipts";
// Razorpay → Webhooks: <site>/api/billing/webhook, events "order.paid" (backstop for buyers who close the tab before
// the callback) and "refund.processed" (a full refund takes back the 30 days that payment bought; partial ones don't).
export async function POST(r:Request){try{
  const bytes=await rawBody(r);
  if(!await verifyWebhook(bytes,r.headers.get("x-razorpay-signature")??""))throw new ApiError(401,"Invalid signature.");
  let event;try{event=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,"Invalid event.");}
  const order=event?.payload?.order?.entity?.id,payment=event?.payload?.payment?.entity,site=new URL(r.url).origin;
  if(event?.event==="order.paid"&&typeof order==="string"&&typeof payment?.id==="string"&&await markOrderPaid(order,payment.id))await sendReceipt(order,site);
  if(event?.event==="refund.processed"&&typeof payment?.order_id==="string"&&typeof payment?.id==="string"){
    const full=payment.refund_status==="full"||(typeof payment.amount==="number"&&payment.amount_refunded>=payment.amount);
    if(full&&await markOrderRefunded(payment.order_id,payment.id))await sendRefundNotice(payment.order_id,site);
  }
  return Response.json({received:true});
}catch(e){return failure(e);}}
