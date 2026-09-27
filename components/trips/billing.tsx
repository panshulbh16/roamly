"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { announcePlus } from "./plus";
type Status={plus:boolean;until:number;usage?:{limit:number;used:number;remaining:number;resetsAt:string}};
type Order={orderId:string;amount:number;currency:string;keyId:string;email?:string};
type Razorpay=new(options:object)=>{open():void;on(event:"payment.failed",cb:(r:{error:{description:string}})=>void):void};
// What /api/billing/callback reports in ?checkout= when it sends the buyer back. Fixed text, so the address can't put words on the page.
const RETURNS:Record<string,string>={
  pending:"Payment received. Plus is switching on; refresh in a minute. If it isn’t active soon, contact support.",
  failed:"The payment didn’t go through, so Plus wasn’t added. You can try again.",
  unverified:"We couldn’t verify that payment. If you were charged, contact support and we’ll sort it out.",
};
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
  async function request(path:string,method="GET") {const r=await fetch("/api/billing/"+path,{method});const data=await r.json();if(!r.ok)throw Error(data.error??"Could not update your membership.");return data;}
  useEffect(()=>{let active=true;const outcome=new URLSearchParams(window.location.search).get("checkout");
    request("status").then(s=>{if(!active)return;setStatus(s);if(!outcome)return;
      window.history.replaceState(window.history.state,"",window.location.pathname); // a reload must not replay the result
      if(outcome==="activated"&&s.plus){setMessage("Payment received. Plus is active.");announcePlus({plus:true,until:s.until});}
      else{const back=RETURNS[outcome==="activated"?"pending":outcome];if(back){setMessage(back);(outcome==="failed"||outcome==="unverified"?toast.error:toast)(back);}} // the note sits below the fold on phones
    }).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
  async function buy(){
    setBusy(true);setMessage("");
    try{
      const [order,Checkout]=await Promise.all([request("checkout","POST") as Promise<Order>,loadCheckout()]);
      const checkout=new Checkout({key:order.keyId,order_id:order.orderId,amount:order.amount,currency:order.currency,name:"Roamly",description:"Plus · 30 days",prefill:{email:order.email},theme:{color:"#2f5d46"},
        // Razorpay posts the result to the server, which grants the pass and redirects back here. A JS handler never
        // runs when paying leaves the page (bank and UPI apps, in-app browsers, the installed app), stranding the buyer.
        callback_url:window.location.origin+"/api/billing/callback",redirect:true,
        modal:{ondismiss:()=>setBusy(false)}});
      checkout.on("payment.failed",r=>{setMessage("Payment failed: "+r.error.description);setBusy(false);});
      checkout.open();
    }catch(e){setMessage((e as Error).message);setBusy(false);}
  }
  return <div>
    {status?.plus&&<section aria-label="Your Plus benefits" className="plus-benefits">
      <h3>Your Plus benefits are ready</h3>
      <p role="status">{status.usage ? `${status.usage.remaining} of ${status.usage.limit} AI plans remaining today` : "20 AI plans per day"}</p>
      <ul><li>Create personalized AI itineraries with 20 plans per day.</li><li>Host city-based trips, publish your itinerary, and approve requests to join.</li></ul>
      <p className="form-note">Replacing one day uses one plan. Your allowance resets at midnight UTC (5:30 am IST). AI planning is subject to availability.</p>
      <div className="plus-benefit-actions"><Link className="primary" href="/">Plan a trip</Link><Link className="secondary-button" href="/together?create=1">Create a group trip</Link></div>
      <p className="form-note">Editing, sharing and PDF export are also available on Free.</p>
      <p className="form-note">Current paid period ends {new Date(status.until*1000).toLocaleDateString()}.</p>
    </section>}
    <p className="form-note">{price} for 30 days, paid once through Razorpay. It never renews on its own; buying again adds another 30 days. Includes 20 AI plans per day; replacing one day uses one plan.</p>
    <button className="primary" disabled={busy||!status} onClick={buy}>{busy?"Opening checkout…":status?.plus?`Add 30 days · ${price}`:`Get Plus · ${price} for 30 days`}</button>
    {message&&<p role="status">{message}</p>}
  </div>;
}
