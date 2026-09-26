"use client";
import { ArrowRight, CalendarDays, MapPin, Minus, Plus, Trash2, UsersRound } from "lucide-react";
import { type OutingInput } from "@/lib/trips/together";

export type EditorMode = "new" | "draft" | "published";
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (date: string) => date ? new Date(date + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Pick a date";

export function TripEditor({ draft, mode, busy, onChange, onSave, onCancel }: {
  draft: OutingInput; mode: EditorMode; busy: boolean;
  onChange: <K extends keyof OutingInput>(key: K, value: OutingInput[K]) => void;
  onSave: (publish: boolean) => void; onCancel: () => void;
}) {
  const published = mode === "published";
  const days = draft.days.length ? draft.days : [""];
  const setDay = (i: number, value: string) => onChange("days", days.map((d, j) => j === i ? value : d));
  const planned = days.filter(d => d.trim()).length;
  return <form className="panel together-editor" onSubmit={e => { e.preventDefault(); onSave(!published); }}>
    <header className="editor-head">
      <span className="eyebrow">{published ? "EDITING YOUR PUBLISHED TRIP" : mode === "draft" ? "EDITING YOUR DRAFT" : "HOST A TRIP"}</span>
      <h2>{published ? "Update your trip." : "Make it your kind of trip."}</h2>
      <p className="subtext">Only the basics are needed. Add the plan now or come back to it any time.</p>
    </header>

    <div className="editor-layout">
      <div className="editor-main">
        <fieldset className="editor-section">
          <legend>The basics <span className="editor-tag">Required</span></legend>
          <label>Trip title<input required maxLength={100} value={draft.title} onChange={e => onChange("title", e.target.value)} placeholder="A relaxed weekend in the hills" /></label>
          <div className="editor-route">
            <label>Leaving from<input required maxLength={100} value={draft.city} onChange={e => onChange("city", e.target.value)} placeholder="Bareilly, Uttar Pradesh" /></label>
            <ArrowRight className="editor-route-arrow" size={18} aria-hidden="true" />
            <label>Going to<input required maxLength={100} value={draft.destination} onChange={e => onChange("destination", e.target.value)} placeholder="Nainital, Uttarakhand" /></label>
          </div>
          <div className="together-fields">
            <label>Departure date<input type="date" required min={today()} value={draft.startDate} onChange={e => onChange("startDate", e.target.value)} /></label>
            <div className="editor-field">
              <span id="places-label">Guest places <small>excluding you</small></span>
              <div className="editor-stepper" role="group" aria-labelledby="places-label">
                <button type="button" aria-label="Fewer places" disabled={draft.capacity <= 1} onClick={() => onChange("capacity", draft.capacity - 1)}><Minus size={16} /></button>
                <output aria-live="polite">{draft.capacity}</output>
                <button type="button" aria-label="More places" disabled={draft.capacity >= 20} onClick={() => onChange("capacity", draft.capacity + 1)}><Plus size={16} /></button>
              </div>
            </div>
          </div>
          <label>Your name, as travellers will see it<input required maxLength={60} value={draft.hostName} onChange={e => onChange("hostName", e.target.value)} placeholder="Your first name" /></label>
        </fieldset>

        <fieldset className="editor-section">
          <legend>The plan <span className="editor-tag optional">Optional</span></legend>
          <label>What’s it like?<textarea maxLength={1000} value={draft.summary} onChange={e => onChange("summary", e.target.value)} placeholder="Travel style, who it suits, what the estimate covers and what guests arrange themselves…" /></label>
          <label>Estimated total per person (₹)<input type="number" min={0} max={1000000} inputMode="numeric" value={draft.cost || ""} onChange={e => onChange("cost", Math.min(1000000, Math.max(0, Math.floor(Number(e.target.value) || 0))))} placeholder="Leave blank if you’re not sure yet" /></label>
          <div className="editor-days">
            <span className="editor-days-title">Day by day</span>
            {days.map((day, i) => <div className="editor-day" key={i}>
              <label>Day {i + 1}<textarea maxLength={2000} value={day} onChange={e => setDay(i, e.target.value)} placeholder={i ? "What happens next…" : "Morning — meet in the city and head out…"} /></label>
              {days.length > 1 && <button type="button" className="text-button editor-remove" aria-label={`Remove day ${i + 1}`} onClick={() => onChange("days", days.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}
            </div>)}
            {days.length < 10 && <button type="button" className="secondary-button editor-add" onClick={() => onChange("days", [...days, ""])}><Plus size={16} /> Add day {days.length + 1}</button>}
          </div>
        </fieldset>

        <details className="editor-section editor-private" open={!!draft.meeting}>
          <summary>Private meeting & contact details <span className="editor-tag optional">Optional</span></summary>
          <label>Only you and approved travellers see this<textarea maxLength={2000} value={draft.meeting} onChange={e => onChange("meeting", e.target.value)} placeholder="Meeting point, time, and the contact you’re happy to share…" /></label>
        </details>
      </div>

      <aside className="editor-preview" aria-label="Preview of your trip card">
        <span className="eyebrow">HOW TRAVELLERS SEE IT</span>
        <article className="panel together-card">
          <h2>{draft.title || "Your trip title"}</h2>
          <p className="subtext">with {draft.hostName || "you"}</p>
          <p><MapPin size={16} />{draft.city || "From"} → {draft.destination || "To"}</p>
          <p><CalendarDays size={16} />{dateLabel(draft.startDate)}{planned ? ` · ${planned} ${planned === 1 ? "day" : "days"}` : ""}</p>
          <p><UsersRound size={16} />{draft.capacity} guest {draft.capacity === 1 ? "place" : "places"}</p>
          {draft.summary && <p className="together-excerpt">{draft.summary}</p>}
          <div className="together-card-bottom"><span>{draft.cost ? `~₹${draft.cost.toLocaleString("en-IN")} / person` : "Cost to be shared"}</span></div>
        </article>
      </aside>
    </div>

    <p className="form-note editor-note">{published ? "Everyone who requested or joined gets a notification when you save changes." : "Public details are visible to everyone. Keep phone numbers and exact addresses in the private section."}</p>
    <div className="editor-actions">
      <div className="editor-buttons">
        {published
          ? <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Discard changes</button>
          : <button type="button" className="secondary-button" disabled={busy} onClick={e => { const form = e.currentTarget.form!; if (form.reportValidity()) onSave(false); }}>Save as draft</button>}
        <button className="primary" disabled={busy}>{busy ? "Saving…" : published ? "Save changes" : "Publish trip"} <ArrowRight size={16} /></button>
      </div>
    </div>
  </form>;
}
