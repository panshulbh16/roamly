import { itinerarySchema, tripSchema, type Itinerary, type Trip } from "./schema";

export type Preview = Partial<Itinerary>;
export type PlannerEvent = { type: "preview"; itinerary: Preview } | { type: "complete"; trip: Trip; historyId: string | null } | { type: "error"; error: string };

// Only expose complete JSON values. Braces inside quoted/escaped text are data.
function valueEnd(text: string, start: number): number {
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') { quoted = false; if (!depth) return i + 1; }
    } else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { if (--depth === 0) return i + 1; }
  }
  return -1;
}

// A day can be displayed as soon as its first complete activity arrives.
// Parse only complete values; never repair or render unfinished strings.
function partialDay(text: string, start: number) {
  const result: Record<string, unknown> = {};
  let i = start + 1;
  const skip = () => { while (i < text.length && /[\s,]/.test(text[i])) i++; };
  while (i < text.length) {
    skip();
    if (text[i] !== '"') break;
    const end = valueEnd(text, i);
    if (end < 0) break;
    const key = JSON.parse(text.slice(i, end));
    i = end; skip();
    if (text[i++] !== ":") break;
    skip();
    if (key === "activities" && text[i] === "[") {
      i++;
      const activities = [];
      while (i < text.length) {
        skip();
        if (text[i] !== "{") break;
        const end = valueEnd(text, i);
        if (end < 0) break;
        activities.push(JSON.parse(text.slice(i, end)));
        i = end;
      }
      result.activities = activities;
      if (text[i] !== "]") break;
      i++;
    } else {
      const end = valueEnd(text, i);
      if (end < 0) break;
      if (key === "title") result.title = JSON.parse(text.slice(i, end));
      i = end;
    }
  }
  const parsed = itinerarySchema.shape.days.element.safeParse(result);
  return parsed.success ? parsed.data : null;
}

export function itineraryPreview(text: string): Preview {
  const result: Record<string, unknown> = {};
  let i = text.indexOf("{") + 1;
  if (!i) return {};
  const skip = () => { while (/[\s,]/.test(text[i] ?? "!") && i < text.length) i++; };
  while (i < text.length) {
    skip();
    if (text[i] !== '"') break;
    const end = valueEnd(text, i);
    if (end < 0) break;
    const key = JSON.parse(text.slice(i, end));
    i = end; skip();
    if (text[i++] !== ":") break;
    skip();
    if (key === "days" && text[i] === "[") {
      i++;
      const days = [];
      while (i < text.length) {
        skip();
        if (text[i] !== "{") break;
        const dayEnd = valueEnd(text, i);
        if (dayEnd < 0) {
          const partial = partialDay(text, i);
          if (partial) days.push(partial);
          break;
        }
        try {
          const day = itinerarySchema.shape.days.element.safeParse(JSON.parse(text.slice(i, dayEnd)));
          if (!day.success) break;
          days.push(day.data);
        } catch { break; }
        i = dayEnd;
      }
      if (days.length) result.days = days.slice(0, 10);
      if (text[i] !== "]") break;
      i++;
    } else {
      const fieldEnd = valueEnd(text, i);
      if (fieldEnd < 0) break;
      if (Object.hasOwn(itinerarySchema.shape, key)) {
        try { result[key] = JSON.parse(text.slice(i, fieldEnd)); } catch { break; }
      }
      i = fieldEnd;
    }
  }
  const parsed = itinerarySchema.partial().safeParse(result);
  return parsed.success ? parsed.data : {};
}

export async function* streamLines(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        if (end > 128000) throw new Error("Stream exceeded its size limit.");
        yield buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
      }
      if (buffer.length > 128000) throw new Error("Stream exceeded its size limit.");
      if (done) { if (buffer) yield buffer; break; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function consumePlannerStream(response: Response, onPreview: (preview: Preview) => void): Promise<Trip> {
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error ?? "Planning failed. Please try again.");
  }
  if (!response.body) throw new Error("Planning stream is unavailable. Please try again.");
  for await (const line of streamLines(response.body)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "preview") onPreview(itinerarySchema.partial().parse(event.itinerary));
    if (event.type === "complete") return tripSchema.parse(event.trip);
  }
  throw new Error("The connection ended before your trip was complete. Please try again.");
}
