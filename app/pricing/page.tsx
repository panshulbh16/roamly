import { currentUser } from "@/lib/auth/server";
import { AppShell } from "@/components/trips/app-shell";
import { Workspace } from "@/components/trips/workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await currentUser();
  return (
    <AppShell user={u}>
      <Workspace view="pricing" />
    </AppShell>
  );
}
