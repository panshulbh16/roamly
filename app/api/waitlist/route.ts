import {
  db,
  failure,
  identity,
  privateHeaders,
  sameOrigin,
} from "@/lib/server/context";
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const u = await identity();
    await db()
      .prepare(
        "INSERT INTO waitlist (owner,email,created_at) VALUES (?,?,?) ON CONFLICT(owner) DO NOTHING",
      )
      .bind(u.id, u.email, new Date().toISOString())
      .run();
    return Response.json({ joined: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
