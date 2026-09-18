import { currentUser } from "@/lib/auth/server";
import { AppShell } from "@/components/trips/app-shell";
import { Workspace } from "@/components/trips/workspace";
import { aiEnabled } from "@/lib/server/planner";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await currentUser();
  return (
    <AppShell user={u}>
      <Workspace aiReady={aiEnabled()} signedIn={!!u} />
    </AppShell>
  );
}
