
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query") ?? "";
  if (query.length > 120) return Response.json({ error: "Destination must be 120 characters or fewer." }, { status: 400 });
  const { resolveDestination, suggestDestinations } = await import("@/lib/trips/destinations.server");
  return Response.json({ resolved: resolveDestination(query), suggestions: suggestDestinations(query) }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
