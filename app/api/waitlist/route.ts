import {
  db,
  failure,
  identity,
  privateHeaders,
  sameOrigin,
} from "@/lib/server/context";
import { seal } from "@/lib/server/vault";
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const u = await identity();
    await db()
      .prepare(
        "INSERT INTO waitlist (owner,email,created_at) VALUES (?,?,?) ON CONFLICT(owner) DO NOTHING",
      )
      .bind(u.id, await seal(u.email, "waitlist.email"), new Date().toISOString())
      .run();
    return Response.json({ joined: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
