import { AppShell } from "@/components/trips/app-shell";
import { TripCostPage } from "@/components/trips/trip-cost";
import { currentUser } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default async function Page() {
  return <AppShell user={await currentUser()}><TripCostPage /></AppShell>;
}
