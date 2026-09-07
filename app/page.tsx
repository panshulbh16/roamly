import { getChatGPTUser } from "./chatgpt-auth";
import { AppShell } from "@/components/trips/app-shell";
import { Workspace } from "@/components/trips/workspace";
import { aiEnabled } from "@/lib/server/planner";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await getChatGPTUser();
  return (
    <AppShell name={u?.displayName ?? "Explorer"}>
      <Workspace aiReady={aiEnabled()} />
    </AppShell>
  );
}
