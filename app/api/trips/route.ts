import {
  body,
  db,
  failure,
  identity,
  privateHeaders,
  sameOrigin,
  ApiError,
} from "@/lib/server/context";
import { tripSchema } from "@/lib/trips/schema";
import { z } from "zod";
export async function GET() {
  try {
    const u = await identity();
    const rows = await db()
      .prepare(
        "SELECT payload FROM trips WHERE owner=? ORDER BY created_at DESC LIMIT 100",
      )
      .bind(u.id)
      .all<{ payload: string }>();
    return Response.json(
      { trips: rows.results.map((r) => JSON.parse(r.payload)) },
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const u = await identity();
    const result = tripSchema.safeParse(await body(r));
    if (!result.success)
      throw new ApiError(400, "Please check your itinerary.");
    const trip = result.data;
    const updated = await db()
      .prepare(
        "INSERT INTO trips (id,owner,payload,created_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM trips WHERE owner=?)<100 OR EXISTS(SELECT 1 FROM trips WHERE id=? AND owner=?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE trips.owner=excluded.owner RETURNING id",
      )
      .bind(
        trip.id,
        u.id,
        JSON.stringify(trip),
        new Date().toISOString(),
        u.id,
        trip.id,
        u.id,
      )
      .first();
    if (!updated)
      throw new ApiError(
        409,
        "Could not save this trip. Your collection may be full; delete an old trip and try again.",
      );
    return Response.json({ saved: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(r: Request) {
  try {
    sameOrigin(r);
    const u = await identity();
    const parsed = z.object({ id: z.string().uuid() }).safeParse(await body(r));
    if (!parsed.success)
      throw new ApiError(400, "Choose a trip to delete.");
    await db()
      .prepare("DELETE FROM trips WHERE id=? AND owner=?")
      .bind(parsed.data.id, u.id)
      .run();
    return Response.json({ deleted: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
