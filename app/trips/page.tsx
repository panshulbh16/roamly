import { requireChatGPTUser } from "../chatgpt-auth";
import { AppShell } from "@/components/trips/app-shell";
import { Workspace } from "@/components/trips/workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireChatGPTUser("/trips");
  return (
    <AppShell name={u.displayName}>
      <Workspace view="trips" />
    </AppShell>
  );
}
