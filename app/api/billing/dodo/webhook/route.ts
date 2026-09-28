import { rawBody,failure,ApiError } from "@/lib/server/context";
import { dodoSignatureValid,handleDodoEvent } from "@/lib/billing/dodo";
// Dodo Payments → Developer → Webhooks: <site>/api/billing/dodo/webhook, events payment.succeeded and refund.succeeded
// (docs/dodo-setup.md). Signed with the Standard Webhooks scheme.
export async function POST(r:Request){try{
  const bytes=await rawBody(r);
  if(!await dodoSignatureValid(bytes,r.headers))throw new ApiError(400,"Invalid signature.");
  let event;try{event=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,"Invalid event.");}
  await handleDodoEvent(event,new URL(r.url).origin);
  return Response.json({received:true});
}catch(e){return failure(e);}}
