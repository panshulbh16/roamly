"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TripFooter } from "./footer";
export function Pricing({ signedIn }: { signedIn: boolean }) {
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  return <main className="workspace">
    <Toaster richColors />
        <>
          <div className="page-heading">
            <div>
              <h1>More room to roam.</h1>
              <p className="subtext">
                Roamly Plus is not available yet. You can join the waitlist below; the free planner is available now.
              </p>
            </div>
          </div>
          <div className="plan-grid">
            <section className="panel">
              <span className="eyebrow">EARLY ACCESS</span>
              <h2 style={{ fontSize: 24, marginTop: 13 }}>
                The everyday explorer
              </h2>
              <div className="price">Free</div>
              <ul>
                {[
                  "Explore destination inspiration",
                  "Edit and save sample itineraries",
                  "Print your day-by-day plans",
                  "Personalized AI when available",
                ].map((t) => (
                  <li key={t}>
                    <Check />
                    {t}
                  </li>
                ))}
              </ul>
              <Link href="/" className="primary" style={{ marginTop: 22 }}>
                Start exploring
              </Link>
            </section>
            <section
              className="panel"
              style={{ borderColor: "#91b09e", background: "#f1f6f2" }}
            >
              <span className="eyebrow">ROAMLY PLUS · COMING SOON</span>
              <h2 style={{ fontSize: 24, marginTop: 13 }}>
                For your next big adventure
              </h2>
              <div className="price" style={{ fontSize: 28 }}>
                Join the early list
              </div>
              <p className="subtext">
                We’re shaping a paid plan for frequent travelers. Pricing and
                included features will be announced before launch. No payment is
                collected.
              </p>
              {!signedIn ? <Link href="/auth?returnTo=%2Fpricing" className="primary" style={{ marginTop: 28, width: "100%" }}>Sign in to join the Plus waitlist<ArrowRight size={15} /></Link> : <button
                disabled={busy || joined}
                className="primary"
                style={{ marginTop: 28, width: "100%" }}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const response = await fetch("/api/waitlist", { method: "POST" });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
                    setJoined(true);
                    toast.success(
                      "You’re on the Roamly Plus early-access list.",
                    );
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {joined
                  ? "You’re on the list"
                  : busy
                    ? "Joining…"
                    : "Join the Plus waitlist"}
                <ArrowRight size={15} />
              </button>}
              <p className="form-note">
                Uses your signed-in email. No charge, no commitment.
              </p>
            </section>
          </div>
        </>
    <TripFooter />
  </main>;
}
