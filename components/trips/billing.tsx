"use client";
import { useEffect, useState } from "react";
import { announcePlus } from "./plus";
type Status={plus:boolean;until:number};
type Order={orderId:string;amount:number;currency:string;keyId:string;email?:string};
type Razorpay=new(options:object)=>{open():void;on(event:"payment.failed",cb:(r:{error:{description:string}})=>void):void};
const loadCheckout=()=>new Promise<Razorpay>((resolve,reject)=>{
  const w=window as unknown as {Razorpay?:Razorpay};
  if(w.Razorpay)return resolve(w.Razorpay);
  const s=document.createElement("script");s.src="https://checkout.razorpay.com/v1/checkout.js";
  s.onload=()=>w.Razorpay?resolve(w.Razorpay):reject(Error("Couldn't load Razorpay. Please try again."));
  s.onerror=()=>reject(Error("Couldn't load Razorpay. Check your connection and try again."));
  document.body.appendChild(s);
});
export function BillingControls({ price = "₹499" }: { price?: string }) {
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function request(path:string,method="GET",body?:unknown) {const r=await fetch("/api/billing/"+path,{method,...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error??"Could not update your membership.");return data;}
  useEffect(()=>{let active=true;request("status").then(s=>{if(active)setStatus(s);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
  async function buy(){
    setBusy(true);setMessage("");
    try{
      const [order,Checkout]=await Promise.all([request("checkout","POST") as Promise<Order>,loadCheckout()]);
      const checkout=new Checkout({key:order.keyId,order_id:order.orderId,amount:order.amount,currency:order.currency,name:"Roamly",description:"Plus · 30 days",prefill:{email:order.email},theme:{color:"#2f5d46"},
        modal:{ondismiss:()=>setBusy(false)},
        handler:async(r:{razorpay_order_id:string;razorpay_payment_id:string;razorpay_signature:string})=>{
          try{await request("confirm","POST",{orderId:r.razorpay_order_id,paymentId:r.razorpay_payment_id,signature:r.razorpay_signature});const next=await request("status");setStatus(next);setMessage("Payment received. Plus is active.");announcePlus({plus:!!next.plus,until:next.until});}
          catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
        }});
      checkout.on("payment.failed",r=>{setMessage("Payment failed: "+r.error.description);setBusy(false);});
      checkout.open();
    }catch(e){setMessage((e as Error).message);setBusy(false);}
  }
  return <div>
    {status?.plus&&<p role="status">Plus active · 20 AI plans per day until {new Date(status.until*1000).toLocaleDateString()}.</p>}
    <p className="form-note">{price} for 30 days, paid once through Razorpay. It never renews on its own; buying again adds another 30 days. Includes 20 AI plans per day; replacing one day uses one plan.</p>
    <button className="primary" disabled={busy||!status} onClick={buy}>{busy?"Opening checkout…":status?.plus?`Add 30 days · ${price}`:`Get Plus · ${price} for 30 days`}</button>
    {message&&<p role="status">{message}</p>}
  </div>;
}
