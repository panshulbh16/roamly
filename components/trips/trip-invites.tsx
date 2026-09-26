"use client";
import { useState } from "react";
import { Mail, Send } from "lucide-react";

export type TripInvite = { email: string; status: "sent" | "accepted" | "expired" };
const LABEL = { sent: "Invited", accepted: "Joined", expired: "Expired" } as const;

export function TripInvites({ tripId, status, invites, onSent }: { tripId: string; status: string; invites: TripInvite[]; onSent: (sent: number) => void }) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function invite(emails: string[]) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/together", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", id: tripId, emails }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn’t send invites. Try again.");
      setText(""); onSent(data.sent ?? 0);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const emails = text.split(/[\s,;]+/).filter(Boolean);
  return <section className="panel trip-invites">
    <h3><Mail size={18} /> Invite people</h3>
    {!["open", "closed"].includes(status) ? <p className="subtext">Publish the trip to invite people by email.</p> : <>
      <p className="form-note">Each person gets a link that signs them in and adds them to this trip. An invite holds a place for 14 days.</p>
      <form onSubmit={e => { e.preventDefault(); if (emails.length) void invite(emails); }}>
        <label>Email addresses<textarea rows={2} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="friend@example.com, another@example.com" /></label>
        {error && <p className="together-message" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !emails.length}><Send size={15} /> {busy ? "Sending…" : emails.length > 1 ? `Send ${emails.length} invites` : "Send invite"}</button>
      </form>
    </>}
    {invites.length > 0 && <ul className="invite-list">
      {invites.map(i => <li key={i.email}>
        <span className="invite-email">{i.email}</span>
        <span className={"invite-status " + i.status}>{LABEL[i.status]}</span>
        {i.status !== "accepted" && ["open", "closed"].includes(status) && <button type="button" className="text-button" disabled={busy} onClick={() => void invite([i.email])}>Resend</button>}
      </li>)}
    </ul>}
  </section>;
}
