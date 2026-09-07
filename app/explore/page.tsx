import { getChatGPTUser } from "../chatgpt-auth";
import { AppShell } from "@/components/trips/app-shell";
import { Workspace } from "@/components/trips/workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await getChatGPTUser();
  return (
    <AppShell name={u?.displayName ?? "Explorer"}>
      <Workspace view="explore" />
    </AppShell>
  );
}
