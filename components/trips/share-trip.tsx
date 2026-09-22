"use client";
import { useState } from "react";
import type { Trip } from "@/lib/trips/schema";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
export function ShareTrip({trip}:{trip:Trip}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [links,setLinks]=useState<{id:string}[]>([]);
  async function request(method:string, data?:unknown) {
    const r=await fetch("/api/shares"+(method==="GET"?"?tripId="+trip.id:""),{method,headers:{"Content-Type":"application/json"},...(data?{body:JSON.stringify(data)}:{})});
    const result=await r.json();if(!r.ok)throw Error(result.error??"Could not update sharing.");return result;
  }
  async function show(){setOpen(true);setBusy(true);setError("");try{setLinks((await request("GET")).shares);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <><button className="secondary-button" onClick={show}>Share trip</button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Share a trip snapshot</DialogTitle><DialogDescription>Anyone with the link can read the itinerary. Your home city, travel dates, account and private preference fields are omitted. Review the itinerary text for personal details before sharing. Later edits need a new link.</DialogDescription>
    {error&&<p role="alert">{error}</p>}
    <button className="primary" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{const saved=await fetch("/api/trips",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(trip)});if(!saved.ok)throw Error((await saved.json()).error??"Could not save trip.");const data=await request("POST",trip);setLinks([...links,{id:data.id}]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Save and create share link</button>
    {links.map(link=><div key={link.id} className="share-link"><input aria-label="Share link" readOnly value={typeof window!=="undefined"?window.location.origin+"/share/"+link.id:""} onFocus={e=>e.target.select()}/><button className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+"/share/"+link.id);setError("Link copied.");}catch{setError("Select the link and copy it manually.");}}}>Copy</button><button className="text-button" disabled={busy} onClick={async()=>{setBusy(true);try{await request("DELETE",link);setLinks(links.filter(l=>l.id!==link.id));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Revoke</button></div>)}
  </DialogContent></Dialog></>;
}
