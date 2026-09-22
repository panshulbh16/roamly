import { z } from "zod";
import { body, db, failure, identity, privateHeaders, sameOrigin, ApiError } from "@/lib/server/context";
import { tripSchema } from "@/lib/trips/schema";
import { shareSnapshot } from "@/lib/trips/share";
const idSchema = z.string().uuid();
export async function GET(r: Request) {
  try {
    const user = await identity();
    const parsed = idSchema.safeParse(new URL(r.url).searchParams.get("tripId"));
    if (!parsed.success) throw new ApiError(400,"Choose a valid trip.");
    const tripId = parsed.data;
    const shares = await db().prepare("SELECT id FROM trip_shares WHERE owner=? AND trip_id=?").bind(user.id, tripId).all<{id:string}>();
    return Response.json({ shares: shares.results }, {headers:privateHeaders});
  } catch(e) { return failure(e); }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const user = await identity();
    const parsed = tripSchema.safeParse(await body(r));
    if (!parsed.success) throw new ApiError(400,"Please check your itinerary.");
    const trip = parsed.data;
    const id = crypto.randomUUID();
    const created = await db().prepare("INSERT INTO trip_shares (id,owner,trip_id,payload) SELECT ?,?,?,? WHERE (SELECT count(*) FROM trip_shares WHERE owner=?)<100 RETURNING id")
      .bind(id,user.id,trip.id,JSON.stringify(shareSnapshot(trip)),user.id).first();
    if (!created) throw new ApiError(409,"Revoke an old share link before creating another.");
    return Response.json({id,path:`/share/${id}`},{headers:privateHeaders});
  } catch(e) { return failure(e); }
}
export async function DELETE(r: Request) {
  try {
    sameOrigin(r);
    const user = await identity();
    const parsed = z.object({id:idSchema}).safeParse(await body(r));
    if (!parsed.success) throw new ApiError(400,"Choose a share link to revoke.");
    await db().prepare("DELETE FROM trip_shares WHERE id=? AND owner=?").bind(parsed.data.id,user.id).run();
    return Response.json({revoked:true},{headers:privateHeaders});
  } catch(e) { return failure(e); }
}
