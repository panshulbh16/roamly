"use client";
import { useEffect, useState } from "react";
type Status={plus:boolean;status:string;until:number};
export function BillingControls() {
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function request(path:string,method="GET") {const r=await fetch("/api/billing/"+path,{method});const data=await r.json();if(!r.ok)throw Error(data.error??"Could not update your subscription.");return data;}
  useEffect(()=>{let active=true;request("status").then(s=>{if(active)setStatus(s);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
  async function refresh(){setBusy(true);try{setStatus(await request("status"));setMessage("");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  const subscribed=status&&["active","pending","halted","authenticated"].includes(status.status);
  return <div>
    {status?.plus&&<p role="status">Plus active · 20 AI plans per day. Current period ends {new Date(status.until*1000).toLocaleDateString()}.</p>}
    {!status?.plus&&<p className="form-note">₹499 billed monthly through Razorpay. Renews monthly until cancelled, for up to 10 years. Includes 20 AI plans per day; replacing one day uses one plan.</p>}
    {!subscribed&&<button className="primary" disabled={busy||!status} onClick={async()=>{setBusy(true);setMessage("");try{const result=await request("checkout","POST");window.location.assign(result.url);}catch(e){setMessage((e as Error).message);setBusy(false);}}}>Continue to Razorpay · ₹499/month</button>}
    <button className="text-button" disabled={busy} onClick={refresh}>Refresh membership after payment</button>
    {subscribed&&<button className="text-button" disabled={busy} onClick={async()=>{if(!window.confirm("Cancel your Plus renewal? Paid access lasts until the current period ends."))return;setBusy(true);try{await request("cancel","POST");setStatus(await request("status"));setMessage("Renewal cancellation requested. You will not be charged for another period.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>Cancel renewal</button>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
