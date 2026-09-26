"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, Sparkles, UsersRound, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type PlusStatus = { plus: boolean; until: number };
const EVENT = "roamly:plus";
// ponytail: module cache so page-to-page navigation doesn't refetch or flash; a reload refetches.
let cached: PlusStatus | null = null;

const PlusContext = createContext<PlusStatus | null>(null);
export const usePlus = () => useContext(PlusContext);

/** Called after a verified payment: updates every Plus-aware surface at once and opens the celebration. */
export function announcePlus(status: PlusStatus) {
  cached = status;
  window.dispatchEvent(new CustomEvent<PlusStatus>(EVENT, { detail: status }));
}

export function PlusProvider({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  const [status, setStatus] = useState<PlusStatus | null>(signedIn ? cached : null);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (!signedIn) { cached = null; setStatus(null); return; }
    let active = true;
    if (!cached) fetch("/api/billing/status").then(r => r.ok ? r.json() : null).then(s => {
      if (active && s) { cached = { plus: !!s.plus, until: s.until ?? 0 }; setStatus(cached); }
    }).catch(() => {});
    const onPlus = (e: Event) => { setStatus((e as CustomEvent<PlusStatus>).detail); setCelebrate(true); };
    window.addEventListener(EVENT, onPlus);
    return () => { active = false; window.removeEventListener(EVENT, onPlus); };
  }, [signedIn]);
  return <PlusContext.Provider value={status}>
    {children}
    <PlusCelebration open={celebrate} until={status?.until ?? 0} onClose={() => setCelebrate(false)} />
  </PlusContext.Provider>;
}

const FEATURES = [
  { icon: Wand2, title: "20 AI plans a day", text: "Four times the free allowance. Replacing one day uses one plan." },
  { icon: UsersRound, title: "Host Travel Together trips", text: "Publish your itinerary and approve who joins." },
  { icon: CalendarPlus, title: "Plan without watching the count", text: "Try more destinations, paces and ideas." },
];

export function PlusCelebration({ open, until, onClose }: { open: boolean; until: number; onClose: () => void }) {
  return <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent className="plus-celebration">
      <div className="plus-burst" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => <span key={i} style={{ "--i": i } as React.CSSProperties} />)}
        <div className="plus-seal"><Sparkles size={30} /></div>
      </div>
      <span className="eyebrow">ROAMLY PLUS</span>
      <DialogTitle className="plus-title">You’re on Plus.</DialogTitle>
      <DialogDescription className="plus-sub">
        Payment received. Everything below is switched on{until ? ` until ${new Date(until * 1000).toLocaleDateString()}` : ""}.
      </DialogDescription>
      <ul className="plus-features">
        {FEATURES.map((f, i) => <li key={f.title} style={{ "--i": i } as React.CSSProperties}>
          <span className="plus-feature-icon"><f.icon size={18} /></span>
          <div><strong>{f.title}</strong><p>{f.text}</p></div>
          <Check className="plus-feature-check" size={17} aria-label="Enabled" />
        </li>)}
      </ul>
      <div className="plus-actions">
        <Link href="/" className="primary" onClick={onClose}>Plan a trip</Link>
        <Link href="/together" className="secondary-button" onClick={onClose}>Host a trip</Link>
      </div>
    </DialogContent>
  </Dialog>;
}

/** Small pill shown next to Plus members' account controls. */
export function PlusBadge() {
  return <span className="plus-badge"><Sparkles size={12} />Plus</span>;
}
