import { currentUser } from "@/lib/auth/server";
import { AppShell } from "@/components/trips/app-shell";
import { Pricing } from "@/components/trips/pricing";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await currentUser();
  return (
    <AppShell user={u}>
      <Pricing signedIn={!!u} />
    </AppShell>
  );
}
