import { currencies, currencyForCountry, validRate } from "@/lib/trips/cost";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const base = params.get("base") || "USD";
  const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? request.headers.get("cf-ipcountry") ?? undefined;
  const currency = params.get("currency") || currencyForCountry(country) || params.get("fallback") || "USD";
  const headers = { "Cache-Control": "private, no-store" };
  if (!currencies.includes(currency) || !["USD", "INR"].includes(base)) return Response.json({ error: "Choose a supported currency." }, { status: 400, headers });
  if (currency === base) return Response.json({ base, currency, rate: 1, date: null }, { headers });
  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/${base}/${currency}`, { signal: AbortSignal.timeout(5000), cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
    if (!response.ok) throw new Error("Rate unavailable");
    const data: unknown = await response.json();
    if (!validRate(data, currency, base)) throw new Error("Invalid rate");
    return Response.json({ base, currency, rate: data.rate, date: data.date }, { headers });
  } catch {
    return Response.json({ error: "Exchange rate unavailable. Showing the original currency; try again to convert." }, { status: 503, headers });
  }
}
