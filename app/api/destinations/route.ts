import { resolveDestination, suggestDestinations } from "@/lib/trips/destinations.server";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query") ?? "";
  return Response.json({ resolved: resolveDestination(query), suggestions: suggestDestinations(query) }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
