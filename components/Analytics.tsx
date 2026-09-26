"use client";
import { useEffect, useSyncExternalStore } from "react";

// Google Analytics 4 with Consent Mode v2: cookieless, anonymous pings until the visitor accepts;
// advertising storage is always denied. Page changes are tracked by GA's history-based page views.
type Choice = "granted" | "denied";
const KEY = "analytics-consent";
const listeners = new Set<() => void>();
declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } }

function read(): Choice | null {
  try { const v = localStorage.getItem(KEY); return v === "granted" || v === "denied" ? v : null; } catch { return null; }
}
function choose(choice: Choice | null) {
  try { if (choice) localStorage.setItem(KEY, choice); else localStorage.removeItem(KEY); } catch { /* private mode: ask again next visit */ }
  if (choice) window.gtag?.("consent", "update", { analytics_storage: choice });
  listeners.forEach(l => l());
}
/** Re-opens the consent bar (for a "Cookie settings" link). */
export const openCookieSettings = () => choose(null);
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const tracked = () => typeof window !== "undefined" && process.env.NODE_ENV === "production" && !/^(localhost|127\.0\.0\.1|\[::1\])$|\.local$/.test(location.hostname);

export function Analytics({ id, site, accent }: { id: string; site: string; accent: string }) {
  // "ssr" on the server and during hydration, so the bar only appears once the stored choice is known.
  const choice = useSyncExternalStore(subscribe, () => (tracked() ? read() ?? "ask" : "off"), () => "ssr");
  useEffect(() => {
    if (!tracked() || window.gtag) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      // gtag must queue the Arguments object itself, not an array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: read() === "granted" ? "granted" : "denied" });
    window.gtag("js", new Date());
    window.gtag("config", id);
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(s);
  }, [id]);
  if (choice !== "ask") return null;
  const button = { padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" } as const;
  return (
    <div role="region" aria-label="Analytics cookies" style={{ position: "fixed", zIndex: 60, left: 16, right: 16, bottom: 16, margin: "0 auto", maxWidth: 560, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "14px 16px", background: "#fff", color: "#222730", border: "1px solid #e3e6e4", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,.14)", fontSize: 13.5, lineHeight: 1.5 }}>
      <p style={{ margin: 0, flex: "1 1 260px" }}>{site} uses Google Analytics cookies to see how the site is used. No ads, and nothing is sold.</p>
      <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
        <button type="button" onClick={() => choose("denied")} style={{ ...button, background: "#fff", color: "#3b4540", border: "1px solid #d5dbd7" }}>Decline</button>
        <button type="button" onClick={() => choose("granted")} style={{ ...button, background: accent, color: "#fff", border: `1px solid ${accent}` }}>Accept</button>
      </div>
    </div>
  );
}
