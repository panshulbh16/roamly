"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Backpack, Armchair, Gem, ArrowLeft } from "lucide-react";
import { bands, browserCurrency, costInputSchema, costUrl, currencies, destinationBand, estimateCost, styles, type CostBand, type CostInput } from "@/lib/trips/cost";
const icons = { Budget: Backpack, Comfort: Armchair, Luxury: Gem };
export function TripCostLinks({ input }: { input: CostInput }) {
  const valid = costInputSchema.safeParse(input).success;
  return (
    <section className="trip-cost-entry" aria-label="Compare trip costs">
      <span className="cost-shortcuts-label">Estimate cost</span>
      <div className="cost-shortcuts">
        {styles.map(style => {
          const Icon = icons[style];
          if (!valid) return <button key={style} type="button" className="cost-shortcut" disabled
            aria-label={`${style} cost estimate: add destination and departure date`}><Icon size={16} aria-hidden="true" /><span>{style}</span></button>;
          return (
            <Link key={style} className="cost-shortcut" href={costUrl(input, style)}
              target="_blank" rel="noopener noreferrer"
              title={`${style} estimate · opens in a new tab`}
              aria-label={`${style} cost estimate (opens in a new tab)`}>
              <Icon size={16} aria-hidden="true" />
              <span>{style}</span>
            </Link>
          );
        })}
      </div>
      <span className="cost-shortcut-hint">{valid ? "Opens a cost breakdown in a new tab." : "Add a destination and departure date first."}</span>
    </section>
  );
}
export function TripCostPage() {
  const params = useSearchParams();
  const parsed = costInputSchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return <main className="workspace cost-page">
    <h1>Add your trip details</h1>
    <p className="subtext">A destination and departure date are required before we show an estimate.</p>
    <form action="/cost" method="get" className="panel cost-details-form">
      <label className="field">Destination<input name="destination" required minLength={2} maxLength={120} defaultValue={(params.get("destination") ?? "").slice(0, 120)} /></label>
      <label className="field">Departure date<input name="startDate" type="date" required /></label>
      <label className="field">Days<input name="days" type="number" required min={1} max={10} defaultValue={params.get("days") || "5"} /></label>
      <label className="field">Travelers<input name="travelers" type="number" required min={1} max={10} defaultValue={params.get("travelers") || "2"} /></label>
      <label className="field">Travel style<select name="budget" defaultValue={styles.find(s => s === params.get("budget")) ?? "Comfort"}>{styles.map(style => <option key={style}>{style}</option>)}</select></label>
      <button className="primary" type="submit">Show estimate</button>
    </form>
  </main>;
  const { destination, startDate, days, travelers } = parsed.data;
  return <CostBreakdown key={JSON.stringify([destination, startDate, days, travelers])} input={parsed.data} initialBand={bands.find(b => b === params.get("band"))} />;
}
export function CostBreakdown({ input, initialBand }: { input: CostInput; initialBand?: CostBand }) {
  const detected = destinationBand(input.destination);
  const [band, setBand] = useState<CostBand>(initialBand ?? detected.band);
  const [currency, setCurrency] = useState("");
  const [conversion, setConversion] = useState<{ currency: string; rate: number; date: string | null } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("roamly.currency"); } catch { /* Storage is optional. */ }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (saved && currencies.includes(saved)) setCurrency(saved);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const fallback = browserCurrency(navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone);
    fetch("/api/currency?" + new URLSearchParams(currency ? { currency } : { fallback }), { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => { if (!controller.signal.aborted) { setConversion(data); setError(""); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message || "Exchange rate unavailable."); });
    return () => controller.abort();
  }, [currency, retry, ready]);
  const estimate = estimateCost(input, band);
  const active = !error && conversion && (!currency || conversion.currency === currency) ? conversion : null;
  const format = (value: number) => active ? new Intl.NumberFormat(undefined, { style: "currency", currency: active.currency, maximumFractionDigits: 0 }).format(value * active.rate) : "—";
  const range = (low: number, high: number) => `${format(low)} – ${format(high)}`;
  const labels: Record<string, string> = { stay: "Accommodation", food: "Food & drinks", transport: "Local transport", activities: "Activities", buffer: "10% contingency" };
  return <main className="workspace cost-page">
    <Link className="text-button" href="/"><ArrowLeft size={15} />Planner</Link>
    <div className="page-heading"><div><span className="eyebrow">YOUR TRIP, YOUR BUDGET</span><h1>{input.destination}</h1><p className="subtext">{input.startDate} · {input.days} days · {estimate.nights} nights · {input.travelers} {input.travelers === 1 ? "traveler" : "travelers"}</p></div><label className="field">Display currency<select value={currency || conversion?.currency || ""} onChange={e => { setCurrency(e.target.value); setConversion(null); setError(""); try { localStorage.setItem("roamly.currency", e.target.value); } catch { /* Optional device preference. */ } }}><option value="" disabled>Detecting currency…</option>{currencies.map(c => <option key={c} value={c}>{c}</option>)}</select></label></div>
    <nav className="cost-shortcuts" aria-label="Travel style">{styles.map(style => {
      const Icon = icons[style];
      return <Link key={style} scroll={false} href={costUrl(input, style) + "&band=" + encodeURIComponent(band)}
        className="cost-shortcut" aria-current={style === input.budget ? "page" : undefined}>
        <Icon size={16} aria-hidden="true" /><span>{style}</span>
      </Link>;
    })}</nav>
    <div className="cost-layout">
      <section className="panel cost-total"><span className="eyebrow">{input.budget.toUpperCase()} · WHOLE GROUP</span><h2 aria-live="polite">{active ? range(estimate.low, estimate.high) : error ? "Conversion unavailable" : "Loading estimate…"}</h2><p>Estimated on-the-ground spending</p><p className="subtext">{active ? `${range(estimate.low / input.travelers, estimate.high / input.travelers)} per person` : "Your estimate will appear when the exchange rate is ready."}</p>
      {error && <div role="alert" className="error">{error}<button className="text-button" onClick={() => { setError(""); setConversion(null); setRetry(r => r + 1); }}>Try again</button></div>}
      <p className="form-note">Planning allowances, not booking quotes. Flights, intercity travel, visas, insurance, shopping and booking taxes/fees are excluded.</p></section>
      <section className="panel"><h2 className="aside-title">Where the money goes</h2><dl className="cost-rows">{estimate.rows.map(row => <div key={row.key}><dt>{labels[row.key]}</dt><dd>{active ? range(row.low, row.high) : "—"}</dd></div>)}</dl></section>
    </div>
    <section className="panel cost-assumptions"><h2 className="aside-title">Make the assumptions fit your trip</h2><label className="field">Destination cost level<select value={band} onChange={e => setBand(e.target.value as CostBand)}>{bands.map(b => <option key={b}>{b}</option>)}</select></label><p className="subtext">{detected.country ? `Suggested from ${detected.country}.` : "We haven’t matched this destination. A mid-cost allowance is shown."} Change this for your specific city or season.</p><p className="subtext">Accommodation assumes {estimate.rooms} {estimate.rooms === 1 ? "room" : "rooms"}, up to two travelers per room, for {estimate.nights} nights. Food, transport and activity allowances cover every traveler on all {input.days} days. No overnight stay is included for a one-day trip.</p><p className="subtext">Your departure date is recorded for this trip; these allowances are not adjusted for seasonal or date-specific prices. These broad USD-based allowances compare travel styles; they don’t price individual itinerary activities or check availability. Peak seasons and special experiences can exceed the range.</p><p className="form-note">{active?.date ? <>Exchange rate dated {active.date} from <a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">Frankfurter</a>. Bank rates and fees may differ.</> : "Base allowances are in USD."} Your currency preference is remembered on this device.</p></section>
  </main>;
}
