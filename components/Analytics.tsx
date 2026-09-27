"use client";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

// Google Analytics 4 with Consent Mode v2: cookieless, anonymous pings until the visitor accepts;
// advertising storage is always denied. Page views are sent here, one per route, with addresses cleaned by safeUrl().
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
/**
 * What Google may see of an address: the route only. Query strings (invite links carry a token that signs people in;
 * trip IDs, checkout results) and share IDs stay on the site, and other sites' addresses are cut to their origin.
 * The one exception is campaign tags (?utm_source=reddit&utm_campaign=…) so a post or ad gets credit for its visits;
 * only short plain values pass, so an email address or token put in a tag is dropped.
 */
const CAMPAIGN = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
export function safeUrl(href: string) {
  const u = new URL(href, location.href);
  if (u.origin !== location.origin) return u.origin + "/";
  const tags = new URLSearchParams();
  for (const key of CAMPAIGN) { const v = u.searchParams.get(key); if (v && /^[\w.-]{1,64}$/.test(v)) tags.set(key, v); }
  return u.origin + u.pathname.replace(/^\/share\/[^/]+/, "/share/:id") + (tags.toString() ? "?" + tags : "");
}
let lastView: { doc: Document; page: string } | null = null; // this document's previous page view
const tracked = () => typeof window !== "undefined" && process.env.NODE_ENV === "production" && !/^(localhost|127\.0\.0\.1|\[::1\])$|\.local$/.test(location.hostname);

export function Analytics({ id, site, accent }: { id: string; site: string; accent: string }) {
  // "ssr" on the server and during hydration, so the bar only appears once the stored choice is known.
  const choice = useSyncExternalStore(subscribe, () => (tracked() ? read() ?? "ask" : "off"), () => "ssr");
  const pathname = usePathname();
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
    window.gtag("config", id, { send_page_view: false });
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(s);
  }, [id]);
  useEffect(() => {
    if (!tracked() || !window.gtag) return;
    const page = safeUrl(location.href);
    const referrer = lastView?.doc === document ? lastView.page : document.referrer ? safeUrl(document.referrer) : "";
    // "set" also covers GA's own events (scrolls, outbound clicks), which would otherwise report the raw address.
    window.gtag("set", { page_location: page, page_referrer: referrer });
    window.gtag("event", "page_view", { page_location: page, page_referrer: referrer, page_title: document.title });
    lastView = { doc: document, page };
  }, [pathname]);
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
