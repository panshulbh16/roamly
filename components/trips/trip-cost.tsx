"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Backpack, Armchair, Gem, ArrowLeft } from "lucide-react";
import { bands, browserCurrency, costInputSchema, costUrl, currencies, destinationBand, estimateCost, styles, validRate, dailyAllowances, type DailyAllowances, type CostBand, type CostInput } from "@/lib/trips/cost";
const icons = { Budget: Backpack, Comfort: Armchair, Luxury: Gem };
export function BudgetSelector({ value, onChange }: { value: CostInput["budget"]; onChange: (value: CostInput["budget"]) => void }) {
  return <section className="trip-cost-entry" aria-label="Travel budget">
    <span className="cost-shortcuts-label">Travel budget · estimate cost</span>
    <div className="cost-shortcuts">{styles.map(style => {
      const Icon = icons[style];
      return <button key={style} type="button" className="cost-shortcut" aria-pressed={value === style} onClick={() => onChange(style)}><Icon size={16} aria-hidden="true" />{style}</button>;
    })}</div>
    <span className="cost-shortcut-hint">Your estimate appears with your itinerary.</span>
  </section>;
}
export function TripCostResult({ input }: { input: CostInput }) {
  const parsed = costInputSchema.safeParse(input);
  if (!parsed.success) return <p className="subtext">Create an itinerary with a departure date to see a cost estimate.</p>;
  return <CostBreakdown input={parsed.data} embedded />;
}
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
export function TripCostPage({ destinationValid = true, resolvedDestination }: { destinationValid?: boolean; resolvedDestination?: string }) {
  const params = useSearchParams();
  const parsed = costInputSchema.safeParse(Object.fromEntries(params));
  if (!parsed.success || !destinationValid) return <main className="workspace cost-page">
    <h1>Add your trip details</h1>
    <p className="subtext">{parsed.success ? "Choose a listed city, town, country, or continent before we show an estimate." : "A destination and departure date are required before we show an estimate."}</p>
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
  return <CostBreakdown key={JSON.stringify([destination, startDate, days, travelers])} input={{ ...parsed.data, destination: resolvedDestination ?? parsed.data.destination }} initialBand={bands.find(b => b === params.get("band"))} />;
}
export function CostBreakdown({ input, initialBand, embedded = false }: { input: CostInput; initialBand?: CostBand; embedded?: boolean }) {
  const [resolved, setResolved] = useState<{ query: string; name: string } | null>(null);
  useEffect(() => {
    if (destinationBand(input.destination).country) return;
    const controller = new AbortController();
    fetch("/api/destinations?" + new URLSearchParams({ query: input.destination }), { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!controller.signal.aborted && data?.resolved?.name) setResolved({ query: input.destination, name: data.resolved.name }); })
      .catch(() => { /* Keep the explicitly labeled generic allowance available. */ });
    return () => controller.abort();
  }, [input.destination]);
  const destination = resolved?.query === input.destination ? resolved.name : input.destination;
  return <ResolvedCostBreakdown key={destination} input={{ ...input, destination }} initialBand={initialBand} embedded={embedded} />;
}
function ResolvedCostBreakdown({ input, initialBand, embedded }: { input: CostInput; initialBand?: CostBand; embedded: boolean }) {
  const detected = destinationBand(input.destination);
  const [band, setBand] = useState<CostBand>(initialBand ?? detected.band);
  const [custom, setCustom] = useState<{ budget: string; rates: DailyAllowances } | null>(null);
  const customRates = custom?.budget === input.budget ? custom.rates : undefined;
  const estimate = estimateCost(input, band, customRates);
  const allowanceMultiplier = { "Lower cost": 0.6, "Mid cost": 1, "Higher cost": 1.6 }[band] / (estimate.currency === "INR" ? 0.6 : 1);
  const defaults = dailyAllowances(input);
  const displayedRates = customRates ?? Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, Math.round(value * allowanceMultiplier)])) as DailyAllowances;
  const [currency, setCurrency] = useState(estimate.currency);
  const [conversion, setConversion] = useState<{ base: string; currency: string; rate: number; date: string | null } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("roamly.currency"); } catch { /* Storage is optional. */ }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCurrency(saved && currencies.includes(saved) ? saved : browserCurrency(navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    if (currency === estimate.currency) return;
    fetch("/api/currency?" + new URLSearchParams({ base: estimate.currency, currency }), { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => {
        if (!validRate({ ...data, quote: data.currency }, currency, estimate.currency)) throw new Error("Invalid exchange rate.");
        if (!controller.signal.aborted) { setConversion(data); setError(""); }
      })
      .catch(() => { if (!controller.signal.aborted) setError("Currency conversion is unavailable. Your estimate is shown in its original currency."); });
    return () => controller.abort();
  }, [currency, retry, ready, estimate.currency]);
  const converted = !error && conversion?.base === estimate.currency && conversion.currency === currency ? conversion : null;
  const active = converted ?? { currency: estimate.currency, rate: 1, date: null };
  const format = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: active.currency, maximumFractionDigits: 0 }).format(value * active.rate);
  const range = (low: number, high: number) => `${format(low)} – ${format(high)}`;
  const labels: Record<string, string> = { stay: "Accommodation", food: "Food & drinks", transport: "Local transport", activities: "Activities", buffer: "10% contingency" };
  return <section className={embedded ? "cost-page trip-cost-result" : "workspace cost-page"} aria-label="Trip cost estimate">
    {!embedded && <Link className="text-button" href="/"><ArrowLeft size={15} />Planner</Link>}
    <div className="page-heading"><div><span className="eyebrow">YOUR TRIP, YOUR BUDGET</span><h1>{input.destination}</h1><p className="subtext">{input.startDate} · {input.days} days · {estimate.nights} nights · {input.travelers} {input.travelers === 1 ? "traveler" : "travelers"}</p></div><label className="field">Display currency<select value={currency || conversion?.currency || ""} onChange={e => { setCurrency(e.target.value); setConversion(null); setError(""); try { localStorage.setItem("roamly.currency", e.target.value); } catch { /* Optional device preference. */ } }}><option value="" disabled>Detecting currency…</option>{currencies.map(c => <option key={c} value={c}>{c}</option>)}</select></label></div>
    {!embedded && <nav className="cost-shortcuts" aria-label="Travel style">{styles.map(style => {
      const Icon = icons[style];
      return <Link key={style} scroll={false} href={costUrl(input, style) + "&band=" + encodeURIComponent(band)}
        className="cost-shortcut" aria-current={style === input.budget ? "page" : undefined}>
        <Icon size={16} aria-hidden="true" /><span>{style}</span>
      </Link>;
    })}</nav>}
    <div className="cost-layout">
      <section className="panel cost-total"><span className="eyebrow">{input.budget.toUpperCase()} · WHOLE GROUP</span><h2 aria-live="polite">{range(estimate.low, estimate.high)}</h2><p>Estimated on-the-ground spending</p>{currency !== active.currency && <p className="form-note">Showing {active.currency}{!error ? ` while converting to ${currency}…` : `; ${currency} conversion unavailable.`}</p>}<p className="subtext">{`${range(estimate.low / input.travelers, estimate.high / input.travelers)} per person`}</p>
      {error && <div role="alert" className="error">{error}<button className="text-button" onClick={() => { setError(""); setConversion(null); setRetry(r => r + 1); }}>Try again</button></div>}
      <p className="form-note">Planning allowances, not booking quotes. Flights, intercity travel, visas, insurance, shopping and booking taxes/fees are excluded.</p></section>
      <section className="panel"><h2 className="aside-title">Where the money goes</h2><dl className="cost-rows">{estimate.rows.map(row => <div key={row.key}><dt>{labels[row.key]}</dt><dd>{range(row.low, row.high)}</dd></div>)}</dl></section>
    </div>
    <section className="panel cost-assumptions"><h2 className="aside-title">Make the assumptions fit your trip</h2><label className="field">Destination cost level<select value={band} onChange={e => { setBand(e.target.value as CostBand); setCustom(null); }}>{bands.map(b => <option key={b}>{b}</option>)}</select></label><p className="subtext">{detected.country ? `Suggested from ${detected.country}.` : "We haven’t matched this destination. A mid-cost allowance is shown."} Change this for your specific city or season.</p><div className="cost-details-form">{(Object.keys(displayedRates) as (keyof DailyAllowances)[]).map(key => <label className="field" key={key}>{labels[key]} ({estimate.currency}, {key === "stay" ? "per room / night" : "per person / day"})<input type="number" min={0} max={1000000} value={displayedRates[key]} onChange={e => { const value = e.target.valueAsNumber; if (Number.isFinite(value) && value >= 0 && value <= 1000000) setCustom({ budget: input.budget, rates: { ...displayedRates, [key]: value } }); }} /></label>)}</div>{customRates && <button className="text-button" onClick={() => setCustom(null)}>Reset allowances</button>}<p className="subtext">Edit these daily allowances to match your hotel and plans. The range includes a 10% contingency. Your departure city does not determine destination prices; travel to and from the destination is excluded.</p><p className="subtext">Accommodation assumes {estimate.rooms} {estimate.rooms === 1 ? "room" : "rooms"}, up to two travelers per room, for {estimate.nights} nights. Food, transport and activity allowances cover every traveler on all {input.days} days. No overnight stay is included for a one-day trip.</p><p className="subtext">Your departure date is recorded for this trip; these allowances are not adjusted for seasonal or date-specific prices. These broad {estimate.currency}-based allowances compare travel styles; they don’t price individual itinerary activities or check availability. Peak seasons and special experiences can exceed the range.</p><p className="form-note">{active?.date ? <>Exchange rate dated {active.date} from <a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">Frankfurter</a>. Bank rates and fees may differ.</> : `Base allowances are in ${estimate.currency}.`} Your currency preference is remembered on this device.</p></section>
  </section>;
}
