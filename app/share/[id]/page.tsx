import Link from "next/link";
import { z } from "zod";
import { db } from "@/lib/server/context";
import type { SharedTrip } from "@/lib/trips/share";
import { PrintTrip } from "@/components/trips/print-trip";
export const dynamic = "force-dynamic";
export const metadata = { title:"Shared trip · Roamly", robots:{index:false,follow:false}, referrer:"no-referrer" };
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id} = await params;
  let trip:SharedTrip|null = null;
  let unavailable = false;
  if(z.string().uuid().safeParse(id).success) {
    try {
      const row = await db().prepare("SELECT payload FROM trip_shares WHERE id=?").bind(id).first<{payload:string}>();
      if(row) trip = JSON.parse(row.payload);
    } catch { unavailable=true; }
  }
  if(!trip) return <main className="workspace"><h1>{unavailable ? "Trip temporarily unavailable" : "This share link is unavailable"}</h1><p>{unavailable ? "Please try again shortly." : "It may have been revoked. Ask the sender for a new link."}</p><Link href="/">Plan your own trip</Link></main>;
  return <main className="workspace shared-trip"><span className="eyebrow">ROAMLY · SHARED ITINERARY</span><h1>{trip.itinerary.title}</h1><p>{trip.destination} · {trip.days} days</p><p className="subtext">{trip.itinerary.summary}</p><PrintTrip />
    <div className="trip-days">{trip.itinerary.days.map((day,i)=><section className="day-card" key={i}><div className="day-header"><span>DAY {i+1}</span><h2>{day.title}</h2></div>{day.activities.map((a,j)=><div className="activity" key={j}><small>{a.time}</small><h3>{a.title}</h3><p>{a.description}</p><p>{a.place}</p></div>)}</section>)}</div>
    <ul>{trip.itinerary.tips.map((tip,i)=><li key={i}>{tip}</li>)}</ul><p className="form-note">A shared snapshot. Later edits are not reflected here. Check opening hours and travel conditions before you go.</p><Link className="text-button no-print" href="/">Plan your own trip</Link></main>;
}
