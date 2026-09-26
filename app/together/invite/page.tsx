import { currentUser } from "@/lib/auth/server";
import { AppShell } from "@/components/trips/app-shell";
import { InviteCard } from "@/components/trips/invite-card";
import { findInvite, inviteProblem } from "@/lib/trips/invites";
import type { OutingInput } from "@/lib/trips/together";
export const dynamic = "force-dynamic";
// The token in this URL is a login credential: never send it onward in a Referer header.
export const metadata = { title: "Trip invite · Roamly", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, query] = await Promise.all([currentUser(), searchParams]);
  const token = typeof query.t === "string" ? query.t : "";
  const invite = token.length >= 20 && token.length <= 100 ? await findInvite(token).catch(() => null) : null;
  const trip = invite ? (JSON.parse(invite.payload) as OutingInput) : null;
  return (
    <AppShell user={user}>
      <InviteCard
        token={token}
        problem={inviteProblem(invite)}
        email={invite?.email ?? ""}
        tripId={invite?.trip ?? ""}
        trip={trip && { title: trip.title, hostName: trip.hostName, city: trip.city, destination: trip.destination, startDate: trip.startDate, days: trip.days.length }}
      />
    </AppShell>
  );
}
