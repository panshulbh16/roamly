import { AppShell } from "@/components/trips/app-shell";
import { TripCostPage } from "@/components/trips/trip-cost";
import { currentUser } from "@/lib/auth/server";
import { costInputSchema } from "@/lib/trips/cost";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, user, { resolveDestination }] = await Promise.all([searchParams, currentUser(), import("@/lib/trips/destinations.server")]);
  const parsed = costInputSchema.safeParse(params);
  const destination = parsed.success ? resolveDestination(parsed.data.destination) : null;
  return <AppShell user={user}><TripCostPage destinationValid={!!destination} resolvedDestination={destination?.name} /></AppShell>;
}
