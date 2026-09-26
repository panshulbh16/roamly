"use client";
import { useEffect, useState } from "react";
type Status={plus:boolean;status:string;until:number;usage?:{limit:number;used:number;remaining:number;resetsAt:string}};
export function BillingControls() {
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function request(path:string,method="GET") {const r=await fetch("/api/billing/"+path,{method});const data=await r.json();if(!r.ok)throw Error(data.error??"Could not update your subscription.");return data;}
  useEffect(()=>{let active=true;request("status").then(s=>{if(active)setStatus(s);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
  async function refresh(){setBusy(true);try{setStatus(await request("status"));setMessage("");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  const subscribed=status&&["active","pending","halted","authenticated"].includes(status.status);
  return <div>
    {status?.plus&&<section aria-label="Your Plus benefits" className="plus-benefits">
      <h3>Your Plus benefits are ready</h3>
      <p role="status">{status.usage ? `${status.usage.remaining} of ${status.usage.limit} AI plans remaining today` : "20 AI plans per day"}</p>
      <ul><li>Create personalized AI itineraries with 20 plans per day.</li><li>Host city-based trips, publish your itinerary, and approve requests to join.</li></ul>
      <p className="form-note">Replacing one day uses one plan. Your allowance resets at midnight UTC (5:30 am IST). AI planning is subject to availability.</p>
      <div className="plus-benefit-actions"><a className="primary" href="/">Plan a trip</a><a className="secondary-button" href="/together?create=1">Create a group trip</a></div>
      <p className="form-note">Editing, sharing and PDF export are also available on Free.</p>
      <p className="form-note">Current paid period ends {new Date(status.until*1000).toLocaleDateString()}.</p>
    </section>}
    {!status?.plus&&<p className="form-note">₹499 billed monthly through Razorpay. Renews monthly until cancelled, for up to 10 years. Includes 20 AI plans per day; replacing one day uses one plan.</p>}
    {!subscribed&&<button className="primary" disabled={busy||!status} onClick={async()=>{setBusy(true);setMessage("");try{const result=await request("checkout","POST");window.location.assign(result.url);}catch(e){setMessage((e as Error).message);setBusy(false);}}}>Continue to Razorpay · ₹499/month</button>}
    <button className="text-button" disabled={busy} onClick={refresh}>{status?.plus?"Refresh membership and allowance":"Refresh membership after payment"}</button>
    {subscribed&&<button className="text-button" disabled={busy} onClick={async()=>{if(!window.confirm("Cancel your Plus renewal? Paid access lasts until the current period ends."))return;setBusy(true);try{await request("cancel","POST");setStatus(await request("status"));setMessage("Renewal cancellation requested. You will not be charged for another period.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>Cancel renewal</button>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
