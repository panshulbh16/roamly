"use client";
import { useEffect, useRef, useState } from "react";
import { ShareTrip } from "./share-trip";
import { moveItem } from "@/lib/trips/edit";
import { TripFooter } from "./footer";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  MapPin,
  ArrowRight,
  Leaf,
  Utensils,
  Landmark,
  Mountain,
  Camera,
  Sun,
  SlidersHorizontal,
  Heart,
  LoaderCircle,
  Bookmark,
  Download,
  ArrowLeft,
  Map,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { starterItinerary } from "@/lib/trips/starter";
import { sampleTrip } from "@/lib/trips/sample";
import { getPackingCues, getTripSignature } from "@/lib/trips/insights";
import { DestinationStays, StayFinder } from "@/components/trips/stay-finder";
import { DestinationCarousel } from "@/components/trips/destination-carousel";
import { BudgetSelector, TripCostResult } from "@/components/trips/trip-cost";
import { DestinationAdvice } from "@/components/trips/destination-advice";
import { intakeSchema, type Trip, type Intake, type Itinerary } from "@/lib/trips/schema";
import { consumePlannerStream, type Preview } from "@/lib/trips/stream";
import { usePlus } from "@/components/trips/plus";
type DestinationSuggestion = { name: string; kind: "city" | "country" | "continent" };
const interests = [
  { name: "Nature", icon: Leaf },
  { name: "Food", icon: Utensils },
  { name: "Culture", icon: Landmark },
  { name: "Adventure", icon: Mountain },
  { name: "Photography", icon: Camera },
  { name: "Relaxation", icon: Sun },
];
const initial: Intake = {
  destination: "",
  startDate: "",
  days: 5,
  travelers: 2,
  budget: "Comfort",
  pace: "Balanced",
  interests: ["Nature", "Food"],
  needs: "",
  homeCity: "",
};
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}
function Choice({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((v) => (
            <SelectItem value={v} key={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function Workspace({
  view = "plan",
  aiReady = false,
  signedIn = true,
}: {
  view?: "plan" | "trips" | "explore";
  aiReady?: boolean;
  signedIn?: boolean;
}) {
  const searchParams = useSearchParams();
  const plus = usePlus();
  const [form, setForm] = useState<Intake>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [starter, setStarter] = useState<Itinerary | null>(null);
  const generation = useRef<AbortController | null>(null);
  useEffect(() => () => {
    generation.current?.abort();
    generation.current = null;
  }, [view, searchParams]);
  const [saved, setSaved] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(view === "trips");
  const [extra, setExtra] = useState(false);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const dayRequest = useRef<AbortController | null>(null);
  useEffect(() => () => dayRequest.current?.abort(), [trip?.id]);
  const [edit, setEdit] = useState<{
    day: number;
    activity: number;
    title: string;
    description: string;
    place: string;
  } | null>(null);
  function update<K extends keyof Intake>(key: K, value: Intake[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  useEffect(() => {
    const query = form.destination.trim();
    const controller = new AbortController();
    const task = window.setTimeout(() => {
      if (view !== "plan" || query.length < 2) { setSuggestions([]); return; }
      fetch("/api/destinations?query=" + encodeURIComponent(query), { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { suggestions: [] })
        .then((data) => { if (!controller.signal.aborted) setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []); })
        .catch(() => {});
    }, 180);
    return () => { window.clearTimeout(task); controller.abort(); };
  }, [form.destination, view]);
  async function load() {
    setLoading(true);
    try {
      setSaved((await api("/api/trips")).trips);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let task: number | undefined;
    let historyTask: number | undefined;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setStarter(null); setPreview(null); } });
    if (view === "trips")
      task = window.setTimeout(() => void load(), 0);
    if (view === "plan") {
      const historyId = searchParams.get("history");
      const destination = searchParams.get("destination");
      if (!historyId && !destination) {
        queueMicrotask(() => {
          if (cancelled) return;
          setTrip(null);
          setError("");
          setBusy(false);
          setForm(initial);
          setExtra(false);
          setEdit(null);
        });
      } else if (historyId) {
        historyTask = window.setTimeout(() => {
          setBusy(true);
          api("/api/history?id=" + encodeURIComponent(historyId))
            .then(({ entry }) => {
              if (cancelled) return;
              setForm(entry.intake);
              setTrip(entry.trip);
              setExtra(true);
            })
            .catch((e) => {
              if (!cancelled) setError(e.message);
            })
            .finally(() => {
              if (!cancelled) setBusy(false);
            });
        }, 0);
      } else {
        queueMicrotask(() => {
          if (cancelled) return;
          setTrip(null);
          setError("");
          setBusy(false);
          setExtra(false);
          setEdit(null);
          setForm((f) => ({
            ...f,
            destination: destination!.slice(0, 120),
          }));
        });
      }
    }
    return () => {
      cancelled = true;
      if (task !== undefined) window.clearTimeout(task);
      if (historyTask !== undefined) window.clearTimeout(historyTask);
    };
  }, [searchParams, view]);
  async function generate(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    const parsed = intakeSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your trip details."); return; }
    if (generation.current) return;
    const starter = starterItinerary(parsed.data);
    const controller = new AbortController();
    generation.current = controller;
    setBusy(true);
    setError("");
    setStarter(starter);
    setTrip(null);
    setPreview({});
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify(form),
      });
      const completed = await consumePlannerStream(response, (next) => { if (!controller.signal.aborted) setPreview(next); });
      controller.signal.throwIfAborted();
      setStarter(null);
      setTrip(completed);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (generation.current === controller) {
        generation.current = null;
        setPreview(null);
        setBusy(false);
      }
    }
  }
  async function regenerateDay(index: number) {
    if (!trip || dayRequest.current) return;
    const current = trip;
    const controller = new AbortController();
    dayRequest.current = controller;
    setRegenerating(index);
    try {
      const response = await fetch("/api/regenerate", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trip: current, day: index }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Could not replace this day.");
      controller.signal.throwIfAborted();
      setTrip(t => {
        if (!t || t.id !== current.id) return t;
        const next = structuredClone(t);
        next.itinerary.days[index] = result.day;
        return next;
      });
      toast.success("Day replaced. Save your trip to keep the change.");
    } catch(e) { if (!controller.signal.aborted) toast.error((e as Error).message); }
    finally { if (dayRequest.current === controller) { dayRequest.current = null; setRegenerating(null); } }
  }
  async function save() {
    if (!trip) return;
    setBusy(true);
    try {
      await api("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trip),
      });
      toast.success("Trip saved to My trips");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await api("/api/trips", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setSaved((s) => s.filter((t) => t.id !== id));
      toast.success("Trip deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function sample() {
    setTrip({
      ...structuredClone(sampleTrip),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const showingPreview = busy && !!preview?.days?.some(day => day.activities.length > 0);
  const draft = showingPreview ? preview : starter ?? preview;
  const cards = <DestinationCarousel />;
  const signature = getTripSignature(trip?.intake ?? form);
  return (
    <main className="workspace">
      <Toaster richColors />
      {!signedIn && <p className="small-tip">Plan a trip without signing in. <Link href="/auth?returnTo=%2F">Sign in</Link> to keep future searches in your history and save trips. Guest searches aren’t saved to an account.</p>}
      {draft ? (
        <div>
          <span className="eyebrow">{showingPreview ? "AI PREVIEW · DRAFT" : "INSTANT STARTER · DRAFT"}</span>
          <h1 className="trip-title">{draft.title ?? `Planning ${form.destination}`}</h1>
          {draft.summary && <p className="subtext">{draft.summary}</p>}
          {busy && <p role="status"><LoaderCircle size={16} className="animate-spin inline" /> Personalizing your trip… {preview?.days?.length ?? 0} of {form.days} days started. Activities appear as they arrive. Saving unlocks when the full itinerary is validated.</p>}
          {error && <p role="alert" className="error">{error} Your starter outline is still available below.</p>}
          <div className="trip-actions">
            <button className="text-button" onClick={() => { generation.current?.abort(); generation.current = null; setStarter(null); setPreview(null); setBusy(false); setError(""); }}>Edit trip details</button>
            {!busy && <button className="primary" onClick={() => void generate()}>Retry personalization</button>}
          </div>
          <div className="trip-days">
            {draft.days?.map((day, i) => (
              <section className="day-card" key={i}>
                <div className="day-header"><span className="day-number">DAY {String(i + 1).padStart(2, "0")}</span><h2>{day.title}</h2></div>
                {day.activities.map((activity, j) => <div className="activity" key={j}><small>{activity.time}</small><h3>{activity.title}</h3><p>{activity.description}</p><p>{activity.place}</p></div>)}
              </section>
            ))}
          </div>
          <DestinationAdvice advice={draft.destinationAdvice} destination={form.destination} />
          {draft.tips && <ul>{draft.tips.map((tip, i) => <li key={i}>{tip}</li>)}</ul>}
          <p className="subtext">You can save the personalized itinerary once it is ready.</p>
        </div>
      ) : trip ? (
        <>
          <button
            className="text-button"
            onClick={() => {
              setTrip(null);
              if (view === "trips") void load();
            }}
          >
            <ArrowLeft size={15} />
            Back to {view === "trips" ? "my trips" : "planning"}
          </button>
          <div style={{ marginTop: 24 }}>
            <span className="eyebrow">
              {trip.source === "sample"
                ? "Example itinerary"
                : "Your personal itinerary"}{" "}
              · {trip.intake.days} days
            </span>
            <h1 className="trip-title">{trip.itinerary.title}</h1>
            <p className="subtext">{trip.itinerary.summary}</p>
            <div className="trip-actions">
              {signedIn ? <button className="primary" disabled={busy} onClick={save}>
                <Bookmark size={16} />
                Save trip
              </button> : <Link className="primary" href="/auth?returnTo=%2F">Sign in to save trips</Link>}
              {signedIn && <ShareTrip key={trip.id} trip={trip} />}
              <button
                className="secondary-button"
                onClick={() => window.print()}
              >
                <Download size={16} />
                Print / Save PDF
              </button>
              <span className="secondary-button">
                {trip.intake.destination} · {trip.intake.travelers} travelers
              </span>
            </div>
          </div>
          <TripCostResult key={trip.id} input={trip.intake} />
          <DestinationAdvice advice={trip.itinerary.destinationAdvice} destination={trip.intake.destination} />
          <div className="planner-layout">
            <div className="trip-days">
              {trip.itinerary.days.map((day, i) => (
                <section className="day-card" key={i}>
                  <div className="day-header">
                    <span className="day-number">
                      DAY {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2 style={{ fontSize: 18, fontWeight: 600 }}>
                      {day.title}
                    </h2>
                  </div>
                  <div className="trip-actions day-controls">
                    <button className="text-button" disabled={i === 0 || regenerating !== null} onClick={() => setTrip(t => t && ({ ...t, itinerary: { ...t.itinerary, days: moveItem(t.itinerary.days, i, i - 1) } }))}>Move day earlier</button>
                    <button className="text-button" disabled={i === trip.itinerary.days.length - 1 || regenerating !== null} onClick={() => setTrip(t => t && ({ ...t, itinerary: { ...t.itinerary, days: moveItem(t.itinerary.days, i, i + 1) } }))}>Move day later</button>
                    {signedIn && <button className="text-button" disabled={regenerating !== null || busy} onClick={() => void regenerateDay(i)}>{regenerating === i ? "Replacing day…" : "Regenerate this day · 1 AI plan"}</button>}
                  </div>
                  {day.activities.map((a, j) => (
                    <div className="activity" key={j}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <small>{a.time}</small>
                        <button
                          disabled={regenerating !== null}
                          aria-label={`Edit ${a.title}`}
                          onClick={() =>
                            setEdit({
                              day: i,
                              activity: j,
                              title: a.title,
                              description: a.description,
                              place: a.place,
                            })
                          }
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                      <div className="trip-actions day-controls">
                        <button className="text-button" aria-label={`Move ${a.title} earlier`} disabled={j === 0 || regenerating !== null} onClick={() => setTrip(t => { if (!t) return t; const next = structuredClone(t); next.itinerary.days[i].activities = moveItem(next.itinerary.days[i].activities, j, j - 1).map((a,k)=>({...a,time:t.itinerary.days[i].activities[k].time})); return next; })}>Earlier</button>
                        <button className="text-button" aria-label={`Move ${a.title} later`} disabled={j === day.activities.length - 1 || regenerating !== null} onClick={() => setTrip(t => { if (!t) return t; const next = structuredClone(t); next.itinerary.days[i].activities = moveItem(next.itinerary.days[i].activities, j, j + 1).map((a,k)=>({...a,time:t.itinerary.days[i].activities[k].time})); return next; })}>Later</button>
                      </div>
                      <h3>{a.title}</h3>
                      <p>{a.description}</p>
                      <a
                        className="text-button"
                        style={{ marginTop: 8 }}
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.place)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin size={13} />
                        Find on map
                      </a>
                    </div>
                  ))}
                </section>
              ))}
            </div>
            <aside className="panel itinerary-aside">
              <div className="signature-card">
                <span className="eyebrow">ROAMLY DNA</span>
                <h2>{signature.name}</h2>
                <p>{signature.line}</p>
                <div className="signature-signals">
                  {signature.signals.map((signal) => (
                    <span key={signal}>{signal}</span>
                  ))}
                </div>
              </div>
              <DestinationStays destination={trip.intake.destination} />
              <h2 className="aside-title">Before you go</h2>
              {trip.itinerary.tips.map((t, i) => (
                <p className="subtext" style={{ marginBottom: 16 }} key={i}>
                  {t}
                </p>
              ))}
              <div className="small-tip packing-tip">
                <strong>Pack for your rhythm</strong>
                <ul>
                  {getPackingCues(trip.intake).map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </div>
              <div className="small-tip">
                <strong>Make it yours</strong>Use the pencil beside an activity
                to adjust your plan. Save again to keep your changes.
              </div>
            </aside>
          </div>
        </>
      ) : view === "plan" ? (
        <>
          <div className="page-heading">
            <div>
              <h1>Where to next?</h1>
              <p className="subtext">
                Big adventures. Little escapes. Let’s make it your kind of trip.
              </p>
            </div>
            <span className="eyebrow">A WORLD OF POSSIBILITIES</span>
          </div>
          <section className="hero">
            <img
              src="/images/dolomites.jpg"
              alt="The dramatic peaks of the Italian Dolomites"
            />
            <div className="hero-copy">
              <span className="eyebrow">GO SOMEWHERE THAT STAYS WITH YOU</span>
              <h2>
                A trip that feels
                <br />
                like you.
              </h2>
              <p>Your interests. Your pace. Your own way to explore.</p>
            </div>
            <span className="hero-location">
              <MapPin size={12} />
              The Dolomites, Italy
            </span>
          </section>
          <div className="planner-layout">
            <section className="panel">
              <h2 className="panel-heading">
                <span className="icon-box">
                  <Sparkles size={18} />
                </span>
                Let’s plan something good
              </h2>
              <p className="subtext">
                A few details, a world of possibilities.
              </p>
              <form onSubmit={generate}>
                <div className="form-grid">
                  <label className="field wide">
                    Where would you like to go?
                    <span className="input-icon">
                      <MapPin />
                      <input
                        required
                        minLength={2}
                        maxLength={120}
                        placeholder="A city, a country, or somewhere on your mind"
                        value={form.destination}
                        onChange={(e) => { update("destination", e.target.value); setError(""); }}
                      />
                    </span>
                    {suggestions.length > 0 && <div className="destination-suggestions" role="listbox" aria-label="Destination suggestions">
                      {suggestions.map((suggestion) => <button type="button" role="option" aria-selected="false" key={suggestion.name} onClick={() => { update("destination", suggestion.name); setSuggestions([]); }}>
                        {suggestion.name}<small>{suggestion.kind}</small>
                      </button>)}
                    </div>}
                  </label>
                  <div className="wide">
                    <DestinationStays destination={form.destination} />
                  </div>
                  <label className="field">
                    When are you going?
                    <input
                      aria-label="Departure date"
                      required
                      type="date"
                      value={form.startDate}
                      onChange={(e) => update("startDate", e.target.value)}
                      onInput={(e) => update("startDate", e.currentTarget.value)}
                    />
                  </label>
                  <Choice
                    label="How long?"
                    value={`${form.days} days`}
                    values={Array.from(
                      { length: 10 },
                      (_, i) => `${i + 1} days`,
                    )}
                    onChange={(v) => update("days", parseInt(v))}
                  />
                  <Choice
                    label="Who's coming?"
                    value={`${form.travelers} ${form.travelers === 1 ? "traveler" : "travelers"}`}
                    values={Array.from(
                      { length: 10 },
                      (_, i) =>
                        `${i + 1} ${i === 0 ? "traveler" : "travelers"}`,
                    )}
                    onChange={(v) => update("travelers", parseInt(v))}
                  />
                  <BudgetSelector value={form.budget} onChange={(value) => update("budget", value)} />
                  <div className="field wide">
                    What do you love?
                    <div className="interests">
                      {interests.map((x) => (
                        <button
                          type="button"
                          key={x.name}
                          aria-pressed={form.interests.includes(x.name)}
                          className={`interest ${form.interests.includes(x.name) ? "chosen" : ""}`}
                          onClick={() =>
                            update(
                              "interests",
                              form.interests.includes(x.name)
                                ? form.interests.filter((y) => y !== x.name)
                                : [...form.interests, x.name],
                            )
                          }
                        >
                          <x.icon size={13} />
                          {x.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="text-button"
                  style={{ marginTop: 19 }}
                  onClick={() => setExtra(!extra)}
                  aria-expanded={extra}
                >
                  <SlidersHorizontal size={14} />
                  {extra ? "Hide preferences" : "A little more about your trip"}
                  <span style={{ color: "#9ba39d", marginLeft: 4 }}>
                    Optional
                  </span>
                </button>
                {extra && (
                  <div className="form-grid">
                    <Choice
                      label="Your pace"
                      value={form.pace}
                      values={["Relaxed", "Balanced", "Packed"]}
                      onChange={(v) => update("pace", v as Intake["pace"])}
                    />
                    <label className="field">
                      Home city
                      <input
                        maxLength={100}
                        placeholder="Where you're traveling from"
                        value={form.homeCity}
                        onChange={(e) => update("homeCity", e.target.value)}
                      />
                    </label>
                    <label className="field wide">
                      Dietary, accessibility & family needs
                      <textarea
                        maxLength={600}
                        placeholder="For example: vegetarian, step-free routes, traveling with a 6-year-old…"
                        value={form.needs}
                        onChange={(e) => update("needs", e.target.value)}
                      />
                    </label>
                  </div>
                )}
                {error && (
                  <div role="alert" className="error">
                    {error}
                  </div>
                )}
                <button className="primary generate" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="loading-spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}{" "}
                  {busy ? "Putting your trip together…" : "Create my itinerary"}
                  {!busy && (
                    <ArrowRight size={16} style={{ marginLeft: "auto" }} />
                  )}
                </button>
                <p className="form-note">
                  {aiReady
                    ? plus?.plus
                      ? "Plus · 20 AI plans a day, personalized around you."
                      : "Personalized around you. Free: 5 plans/day · Plus: 20."
                    : "Early access · Searches are saved to History. AI planning opens soon."}
                </p>
              </form>
            </section>
            <aside className="planner-aside">
              <div className="signature-card">
                  <span className="eyebrow">ROAMLY DNA</span>
                  <h2>{signature.name}</h2>
                  <p>{signature.line}</p>
                  <div className="signature-signals">
                    {signature.signals.map((signal) => (
                      <span key={signal}>{signal}</span>
                    ))}
                  </div>
              </div>
              <div className="panel planner-benefits">
                <h2 className="aside-title">Not just a trip. Your trip.</h2>
                <div className="benefit">
                  <Heart />
                  <div>
                    <strong>Built around you</strong>Your interests, your
                    budget, your travel style.
                  </div>
                </div>
                <div className="benefit">
                  <Map />
                  <div>
                    <strong>A day-by-day game plan</strong>Thoughtful days, with
                    room for the unexpected.
                  </div>
                </div>
                <div className="benefit">
                  <SlidersHorizontal />
                  <div>
                    <strong>Room to make it yours</strong>Change the details.
                    Keep the adventure.
                  </div>
                </div>
                <div className="quote-box">
                  “The best part of a trip?
                  <br />
                  Making it your own.”
                </div>
              </div>
              <div className="small-tip planner-inspiration">
                <strong>
                  <Sparkles
                    size={14}
                    style={{ display: "inline", marginRight: 5 }}
                  />
                  A little inspiration goes a long way
                </strong>
                Take a look at a three-day Kyoto example.
                <button
                  className="text-button"
                  style={{ marginTop: 12 }}
                  onClick={sample}
                >
                  Explore the sample itinerary <ArrowRight size={13} />
                </button>
              </div>
            </aside>
          </div>
          <div className="section-heading">
            <h2>A little inspiration</h2>
            <Link href="/explore" className="text-button">
              Explore destinations <ArrowRight size={13} />
            </Link>
          </div>
          {cards}
          <StayFinder />
          <button
            className="text-button"
            style={{ marginTop: 18 }}
            onClick={sample}
          >
            Or explore a sample itinerary <ArrowRight size={13} />
          </button>
        </>
      ) : view === "trips" ? (
        <>
          <div className="page-heading">
            <div>
              <h1>Your trips, all together.</h1>
              <p className="subtext">
                A home for the adventures you’re dreaming of.
              </p>
            </div>
            <Link href="/" className="primary">
              <Sparkles size={15} />
              New trip
            </Link>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                onClick={load}
                style={{ marginLeft: 10, textDecoration: "underline" }}
              >
                Try again
              </button>
            </div>
          )}
          {loading ? (
            <p role="status">Loading your trips…</p>
          ) : !saved.length ? (
            <div className="empty-state">
              <Map size={40} />
              <h2>Your next chapter is unwritten.</h2>
              <p className="subtext">
                Create an itinerary and save it here for later.
              </p>
              <Link
                href="/"
                className="primary"
                style={{ width: "fit-content" }}
              >
                Plan my first trip <ArrowRight size={15} />
              </Link>
              <button
                className="text-button"
                style={{ margin: "auto" }}
                onClick={sample}
              >
                Start with the Kyoto example
              </button>
            </div>
          ) : (
            <div className="plan-grid">
              {saved.map((t) => (
                <article className="panel" key={t.id}>
                  <span className="eyebrow">
                    {t.intake.days} days ·{" "}
                    {t.source === "sample" ? "Example" : "Personal itinerary"}
                  </span>
                  <h2
                    style={{
                      fontFamily: "Georgia",
                      fontSize: 25,
                      margin: "12px 0",
                    }}
                  >
                    {t.itinerary.title}
                  </h2>
                  <p className="subtext">{t.intake.destination}</p>
                  <div className="trip-actions">
                    <button className="primary" onClick={() => setTrip(t)}>
                      Open itinerary <ArrowRight size={15} />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          className="secondary-button"
                          aria-label={`Delete ${t.itinerary.title}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogTitle>Delete this trip?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes the saved itinerary from your account.
                          This cannot be undone.
                        </AlertDialogDescription>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep trip</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(t.id)}>
                            Delete trip
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : view === "explore" ? (
        <>
          <div className="page-heading">
            <div>
              <h1>Follow your curiosity.</h1>
              <p className="subtext">
                A few places to get your next chapter started.
              </p>
            </div>
          </div>
          {cards}
          <StayFinder />
          <section className="panel" style={{ marginTop: 25 }}>
            <span className="eyebrow">A CLOSER LOOK</span>
            <h2 className="trip-title">Three days, a little Kyoto.</h2>
            <p className="subtext">
              Temple gardens, old streets, and the freedom to take it slow.
              Explore an example of your day-by-day itinerary.
            </p>
            <button
              className="primary"
              style={{ marginTop: 20 }}
              onClick={sample}
            >
              Open sample itinerary <ArrowRight size={16} />
            </button>
          </section>
        </>
      ) : null}
      <TripFooter />
      <Dialog open={!!edit} onOpenChange={() => setEdit(null)}>
        <DialogContent>
          <DialogTitle>Make this moment yours</DialogTitle>
          <DialogDescription>
            Update the activity, then save your itinerary to keep the changes.
          </DialogDescription>
          {edit && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setTrip((t) => {
                  if (!t) return t;
                  const copy = structuredClone(t);
                  copy.itinerary.days[edit.day].activities[
                    edit.activity
                  ].title = edit.title;
                  copy.itinerary.days[edit.day].activities[
                    edit.activity
                  ].description = edit.description;
                  copy.itinerary.days[edit.day].activities[
                    edit.activity
                  ].place = edit.place;
                  return copy;
                });
                setEdit(null);
              }}
            >
              <label className="field">
                Activity
                <input
                  required
                  maxLength={160}
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                />
              </label>
              <label className="field" style={{ marginTop: 15 }}>
                Your plan
                <textarea
                  required
                  rows={5}
                  maxLength={800}
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                />
              </label>
              <label className="field" style={{ marginTop: 15 }}>
                Location
                <input
                  required
                  maxLength={160}
                  value={edit.place}
                  onChange={(e) => setEdit({ ...edit, place: e.target.value })}
                />
              </label>
              <button className="primary" style={{ marginTop: 20 }}>
                Update activity
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
