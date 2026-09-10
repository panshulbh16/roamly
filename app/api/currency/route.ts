import { currencies, currencyForCountry, validRate } from "@/lib/trips/cost";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? request.headers.get("cf-ipcountry") ?? undefined;
  const currency = params.get("currency") || currencyForCountry(country) || params.get("fallback") || "USD";
  const headers = { "Cache-Control": "private, no-store" };
  if (!currencies.includes(currency)) return Response.json({ error: "Choose a supported currency." }, { status: 400, headers });
  if (currency === "USD") return Response.json({ currency, rate: 1, date: null }, { headers });
  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/USD/${currency}`, { signal: AbortSignal.timeout(5000), cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
    if (!response.ok) throw new Error("Rate unavailable");
    const data: unknown = await response.json();
    if (!validRate(data, currency)) throw new Error("Invalid rate");
    return Response.json({ currency, rate: data.rate, date: data.date }, { headers });
  } catch {
    return Response.json({ error: "Exchange rate unavailable. Choose USD or try again." }, { status: 503, headers });
  }
}
