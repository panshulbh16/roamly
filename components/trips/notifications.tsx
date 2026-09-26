"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Notice = { id:string; tripId:string; type:string; createdAt:string; readAt:string|null };
type Page = { items:Notice[]; unreadCount:number; nextCursor:string|null };
type Session = { controller:AbortController; busy:boolean };
const messages: Record<string,string> = {
  request_received:"Someone requested to join your trip.",
  request_approved:"Your request to join was approved.",
  request_declined:"Your request to join was declined.",
  request_removed:"You were removed from a trip.",
  request_withdrawn:"A traveller withdrew from your trip.",
  trip_cancelled:"The host cancelled a trip you requested to join.",
  meeting_updated:"The host updated your trip’s private meeting details.",
  trip_updated:"The host changed the details of a trip you requested or joined.",
  invite_accepted:"Someone you invited by email joined your trip.",
};
async function response(r:Response) {
  const result=await r.json();
  if(!r.ok) throw new Error(result.error??"Notifications could not be loaded. Try again.");
  return result;
}
export function Notifications() {
  const [open,setOpen]=useState(false), [items,setItems]=useState<Notice[]>([]);
  const [unread,setUnread]=useState<number|null>(null), [cursor,setCursor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false), [loaded,setLoaded]=useState(false), [error,setError]=useState("");
  const session=useRef<Session|null>(null);
  const load=useCallback(async (after:string|null=null)=>{
    const current=session.current;
    if(!current || current.busy) return;
    current.busy=true;setBusy(true);
    try {
      const data:Page=await fetch("/api/notifications"+(after?"?cursor="+encodeURIComponent(after):""),{cache:"no-store",signal:current.controller.signal}).then(response);
      if(session.current!==current)return;
      setItems(previous=>{
        if(!after)return data.items;
        const merged=new Map(previous.map(n=>[n.id,n]));
        for(const notice of data.items)merged.set(notice.id,notice);
        return [...merged.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
      });
      setCursor(data.nextCursor);
      setUnread(data.unreadCount);setLoaded(true);setError("");
    } catch(e) {
      if(session.current===current&&!current.controller.signal.aborted)setError(e instanceof Error?e.message:"Notifications could not be loaded. Try again.");
    } finally {
      current.busy=false;
      if(session.current===current)setBusy(false);
    }
  },[]);
  useEffect(()=>{
    if(!open)return;
    const current:Session={controller:new AbortController(),busy:false};session.current=current;
    setLoaded(false);setError("");setItems([]);setCursor(null);void load();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);
    return ()=>{window.clearInterval(timer);current.controller.abort();if(session.current===current)session.current=null;};
  },[open,load]);
  async function markRead(id:string) {
    const current=session.current;if(!current||current.busy)return;
    current.busy=true;setBusy(true);setError("");
    try {
      await fetch('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id}),signal:current.controller.signal}).then(response);
      if(session.current!==current)return;
      setItems(previous=>previous.map(n=>n.id===id?{...n,readAt:new Date().toISOString()}:n));
      setUnread(n=>n===null?null:Math.max(0,n-1));
    } catch(e) {
      if(session.current===current&&!current.controller.signal.aborted)setError(e instanceof Error?e.message:"Could not mark this notification read. Try again.");
    } finally {current.busy=false;if(session.current===current)setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button className="notification-trigger" aria-label={unread?`Notifications, ${unread} unread`:"Notifications"} title="Open to check trip updates">
      <Bell size={18}/><span className="hidden lg:inline">Notifications</span>
      {!!unread&&<span className="notification-badge" aria-hidden="true">{unread>99?'99+':unread}</span>}
    </button></DialogTrigger>
    <DialogContent className="notification-dialog">
      <DialogTitle>Trip notifications</DialogTitle>
      <DialogDescription>Requests, decisions and changes to your Travel Together trips. Refresh shows the latest updates. This inbox refreshes every 30 seconds while visible.</DialogDescription>
      <div className="notification-tools"><span aria-live="polite">{unread===null?'Your trip updates':`${unread} unread`}</span><button className="text-button" disabled={busy} onClick={()=>void load()}>Refresh</button></div>
      {error&&<p className="notification-error" role="alert">{error} <button disabled={busy} onClick={()=>void load()}>Retry</button></p>}
      {!loaded&&busy&&<p role="status">Loading notifications…</p>}
      {loaded&&!items.length&&<div className="notification-empty"><Bell size={28}/><h3>You’re all caught up</h3><p>New requests and trip updates will appear here. Earlier activity is still in My activity.</p><Link href="/together" onClick={()=>setOpen(false)}>Explore Travel Together</Link></div>}
      {!!items.length&&<ol className="notification-list" aria-label="Trip updates">{items.map(n=><li key={n.id} className={n.readAt?'':'unread'}>
        <div className="notification-meta"><span>{n.readAt?'Read':'Unread'}</span><time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time></div>
        <p>{messages[n.type]??'There is an update to your trip.'}</p>
        <div className="notification-actions"><Link href={'/together?trip='+encodeURIComponent(n.tripId)} onClick={()=>setOpen(false)}>View trip <span className="sr-only">{n.tripId}</span></Link>{!n.readAt&&<button className="text-button" disabled={busy} onClick={()=>void markRead(n.id)}>Mark read<span className="sr-only"> notification {n.id}</span></button>}</div>
      </li>)}</ol>}
      {cursor&&<button className="secondary-button" disabled={busy} onClick={()=>void load(cursor)}>{busy?'Loading…':'Load older updates'}</button>}
    </DialogContent>
  </Dialog>;
}
