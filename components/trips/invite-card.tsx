"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, MailCheck, UsersRound } from "lucide-react";
import { TripFooter } from "./footer";

type TripSummary = { title: string; hostName: string; city: string; destination: string; startDate: string; days: number };
const dateLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

export function InviteCard({ token, problem, email, tripId, trip }: { token: string; problem: string | null; email: string; tripId: string; trip: TripSummary | null }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function join() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/together/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn’t join the trip. Try again.");
      window.location.assign(data.redirectTo);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <main className="workspace together invite-page">
    <section className="panel invite-card">
      <span className="invite-icon"><UsersRound size={26} /></span>
      {problem || !trip ? <>
        <h1>This invite can’t be used</h1>
        <p className="subtext">{problem}</p>
        <div className="invite-actions">
          {tripId && <Link className="primary" href={"/auth?returnTo=" + encodeURIComponent("/together?trip=" + tripId)}>Sign in to see the trip <ArrowRight size={16} /></Link>}
          <Link className="secondary-button" href="/together">Discover trips</Link>
        </div>
      </> : <>
        <span className="eyebrow">YOU’RE INVITED</span>
        <h1>{trip.hostName} invited you on a trip</h1>
        <div className="invite-trip">
          <strong>{trip.title}</strong>
          <p><MapPin size={16} />{trip.city} → {trip.destination}</p>
          <p><CalendarDays size={16} />{dateLabel(trip.startDate)}{trip.days ? ` · ${trip.days} ${trip.days === 1 ? "day" : "days"}` : ""}</p>
        </div>
        <p className="invite-account"><MailCheck size={16} />You’ll be signed in as <strong>{email}</strong></p>
        {error && <p className="together-message" role="alert">{error}</p>}
        <button className="primary invite-join" disabled={busy} onClick={join}>{busy ? "Joining…" : "Join the trip"} <ArrowRight size={16} /></button>
        <p className="form-note">No password needed. Joining adds you as a traveller so you can see the plan and the host’s private meeting details.</p>
      </>}
    </section>
    <TripFooter />
  </main>;
}
