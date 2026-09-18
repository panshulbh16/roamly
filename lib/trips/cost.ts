import { z } from "zod";
import { intakeSchema } from "./schema";
import { stayCollections } from "./stays";

export const styles = ["Budget", "Comfort", "Luxury"] as const;
export const costInputSchema = z.object({
  destination: z.string().trim().min(2).max(120),
  startDate: intakeSchema.shape.startDate.refine(value => value.length > 0, "Choose a departure date"),
  days: z.coerce.number().int().min(1).max(10),
  travelers: z.coerce.number().int().min(1).max(10),
  budget: z.enum(styles),
});
export type CostInput = z.infer<typeof costInputSchema>;
export const bands = ["Lower cost", "Mid cost", "Higher cost"] as const;
export type CostBand = typeof bands[number];
// Editable planning allowances in USD, not market quotes. Keep pricing policy here.
const daily = {
  Budget: { stay: 45, food: 20, transport: 10, activities: 15 },
  Comfort: { stay: 110, food: 45, transport: 25, activities: 35 },
  Luxury: { stay: 300, food: 100, transport: 75, activities: 90 },
};
// Illustrative domestic allowances in INR: room/night and person/day.
// These are editable planning defaults, not live hotel or activity quotes.
const indiaDaily = {
  Budget: { stay: 1200, food: 400, transport: 200, activities: 200 },
  Comfort: { stay: 3000, food: 800, transport: 400, activities: 500 },
  Luxury: { stay: 8000, food: 2000, transport: 1500, activities: 1500 },
};
const lower = new Set(["India", "Indonesia", "Thailand", "Vietnam", "Peru", "Morocco", "Egypt"]);
const higher = new Set(["Switzerland", "United Kingdom", "United States", "Canada", "Australia", "New Zealand", "France", "Italy", "United Arab Emirates"]);
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
export function destinationBand(destination: string): { band: CostBand; country: string | null } {
  const value = normalize(destination);
  const tokens = value.split(/\s*,\s*/);
  const country = stayCollections.find(c => tokens.includes(normalize(c.country)))?.country
    ?? stayCollections.find(c => c.destinations.some(d => normalize(d) === value))?.country;
  return { country: country ?? null, band: country ? lower.has(country) ? "Lower cost" : higher.has(country) ? "Higher cost" : "Mid cost" : "Mid cost" };
}
export type DailyAllowances = typeof daily.Comfort;
export function dailyAllowances(input: CostInput): DailyAllowances {
  return { ...(destinationBand(input.destination).country === "India" ? indiaDaily : daily)[input.budget] };
}
export function estimateCost(input: CostInput, band: CostBand, custom?: DailyAllowances) {
  const trip = costInputSchema.parse(input);
  if (!bands.includes(band)) throw new Error("Invalid cost band");
  const factor = { "Lower cost": 0.6, "Mid cost": 1, "Higher cost": 1.6 }[band];
  const domestic = destinationBand(trip.destination).country === "India";
  const rates = custom ?? dailyAllowances(trip);
  if (Object.values(rates).some(value => !Number.isFinite(value) || value < 0 || value > 1000000)) throw new Error("Invalid daily allowance");
  // India defaults already reflect the lower-cost category.
  const multiplier = custom ? 1 : domestic ? factor / 0.6 : factor;
  const nights = trip.days - 1;
  const rooms = Math.ceil(trip.travelers / 2);
  const quantities = { stay: nights * rooms, food: trip.days * trip.travelers, transport: trip.days * trip.travelers, activities: trip.days * trip.travelers };
  const rows = (Object.keys(rates) as (keyof typeof rates)[]).map(key => ({ key, low: Math.round(rates[key] * multiplier * quantities[key] * 0.8), high: Math.round(rates[key] * multiplier * quantities[key] * 1.3) }));
  const subtotal = rows.reduce((s, r) => ({ low: s.low + r.low, high: s.high + r.high }), { low: 0, high: 0 });
  const buffer = { key: "buffer", low: Math.round(subtotal.low * 0.1), high: Math.round(subtotal.high * 0.1) };
  return { currency: domestic ? "INR" : "USD", rows: [...rows, buffer], low: subtotal.low + buffer.low, high: subtotal.high + buffer.high, nights, rooms };
}
export function costUrl(input: CostInput, budget = input.budget) {
  return "/cost?" + new URLSearchParams({ destination: input.destination, startDate: input.startDate, days: String(input.days), travelers: String(input.travelers), budget }).toString();
}
export const currencies = Intl.supportedValuesOf("currency");
export function currencyForCountry(country: string | undefined) {
  const groups: Record<string, string> = { INR: "IN", USD: "US", GBP: "GB", EUR: "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK", JPY: "JP", AUD: "AU", CAD: "CA", NZD: "NZ", CHF: "CH LI", AED: "AE", SAR: "SA", CNY: "CN", HKD: "HK", SGD: "SG", MYR: "MY", THB: "TH", IDR: "ID", VND: "VN", PHP: "PH", KRW: "KR", TWD: "TW", PKR: "PK", BDT: "BD", LKR: "LK", NPR: "NP", ZAR: "ZA", BRL: "BR", MXN: "MX", TRY: "TR", NOK: "NO", SEK: "SE", DKK: "DK", PLN: "PL", CZK: "CZ", HUF: "HU", RON: "RO", ILS: "IL", EGP: "EG", MAD: "MA", PEN: "PE", ARS: "AR", CLP: "CL", COP: "CO", NGN: "NG", KES: "KE", BHD: "BH", KWD: "KW", QAR: "QA", OMR: "OM" };
  return Object.entries(groups).find(([, regions]) => regions.split(" ").includes(country?.toUpperCase() ?? ""))?.[0];
}
export function browserCurrency(locale: string, timeZone: string) {
  if (["Asia/Kolkata", "Asia/Calcutta"].includes(timeZone)) return "INR";
  try { return currencyForCountry(new Intl.Locale(locale).region) ?? "USD"; } catch { return "USD"; }
}
export function validRate(data: unknown, currency: string, base = "USD"): data is { rate: number; date: string } {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.base === base && d.quote === currency && typeof d.rate === "number" && Number.isFinite(d.rate) && d.rate > 0 && d.rate < 1e9 && typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date);
}
