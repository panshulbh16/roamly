import { cookies } from "next/headers";
import { z } from "zod";
import { authCookieOptions } from "@/lib/auth/config";
import { requiredClient } from "@/lib/auth/requests";
import { ApiError, body, db, failure, privateHeaders, sameOrigin } from "@/lib/server/context";
import { findInvite, inviteProblem, invitesReady, signInAs } from "@/lib/trips/invites";

// Accepting is a POST from the invite page, so link-scanning bots that prefetch email links can't use it up.
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    if (!invitesReady()) throw new ApiError(503, "Email invites aren’t set up yet.");
    const parsed = z.object({ token: z.string().min(20).max(100) }).safeParse(await body(r));
    if (!parsed.success) throw new ApiError(400, "This invite link isn’t valid.");
    const invite = await findInvite(parsed.data.token);
    const problem = inviteProblem(invite);
    if (problem) throw new ApiError(409, problem);
    const member = await signInAs(invite!.email, await requiredClient());
    const jar = await cookies();
    jar.delete("roamly-signed-out");
    jar.set("roamly-auth-provider", "supabase", { ...authCookieOptions, maxAge: 31536000 });
    if (member === invite!.owner) throw new ApiError(409, "You’re the host of this trip.");
    const joined = await db().prepare(`INSERT INTO outing_requests (trip_id,member,name,message,status,created_at)
      SELECT ?,?,?,?,'approved',? WHERE (SELECT count(*) FROM outing_requests WHERE trip_id=? AND status='approved' AND member<>?)<(SELECT capacity FROM outings WHERE id=?)
      ON CONFLICT(trip_id,member) DO UPDATE SET status='approved' RETURNING member`)
      .bind(invite!.trip, member, invite!.email.split("@")[0].slice(0, 60), "Joined by invitation from the host.", new Date().toISOString(), invite!.trip, member, invite!.trip).first();
    if (!joined) throw new ApiError(409, "You’re signed in, but this trip is now full. Ask the host to make room.");
    await db().prepare("UPDATE outing_invites SET status='accepted',member=? WHERE id=? AND status='sent'").bind(member, invite!.id).run();
    return Response.json({ redirectTo: "/together?trip=" + invite!.trip }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
