import { z } from "zod";
import { ApiError, body, db, failure, identity, privateHeaders, sameOrigin } from "@/lib/server/context";
const idSchema = z.string().regex(/^[a-f0-9]{32}$/);
const cursorSchema = z.object({ createdAt: z.string().datetime({ precision: 3 }), id: idSchema }).strict();
type NotificationRow = { id: string; tripId: string; type: string; createdAt: string; readAt: string | null };
export async function GET(r: Request) {
  try {
    const user = await identity();
    const raw = new URL(r.url).searchParams.get("cursor");
    let cursor: z.infer<typeof cursorSchema> | null = null;
    if (raw !== null) {
      if (raw.length > 200) throw new ApiError(400, "Invalid notification page.");
      try { cursor = cursorSchema.parse(JSON.parse(raw)); }
      catch { throw new ApiError(400, "Invalid notification page."); }
    }
    const rows = await db().prepare(`SELECT id,trip_id AS tripId,type,created_at AS createdAt,read_at AS readAt
      FROM notifications WHERE recipient=? ${cursor ? "AND (created_at<? OR (created_at=? AND id<?))" : ""}
      ORDER BY created_at DESC,id DESC LIMIT 21`)
      .bind(user.id, ...(cursor ? [cursor.createdAt,cursor.createdAt,cursor.id] : [])).all<NotificationRow>();
    const items = rows.results.slice(0,20), last = items.at(-1);
    const count = await db().prepare("SELECT count(*) AS n FROM notifications WHERE recipient=? AND read_at IS NULL").bind(user.id).first<{n:number}>();
    return Response.json({ items, unreadCount: count?.n ?? 0, nextCursor: rows.results.length > 20 && last ? JSON.stringify({createdAt:last.createdAt,id:last.id}) : null }, {headers:privateHeaders});
  } catch(e) { return failure(e); }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const user = await identity(), parsed = z.object({id:idSchema}).safeParse(await body(r));
    if (!parsed.success) throw new ApiError(400,"Choose a valid notification.");
    const updated = await db().prepare("UPDATE notifications SET read_at=coalesce(read_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=? AND recipient=? RETURNING id")
      .bind(parsed.data.id,user.id).first();
    if (!updated) throw new ApiError(404,"This notification is unavailable.");
    return Response.json({ok:true},{headers:privateHeaders});
  } catch(e) { return failure(e); }
}
