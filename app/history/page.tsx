import { currentUser } from "@/lib/auth/server";
import { authConfig } from "@/lib/auth/config";
import { AppShell } from "@/components/trips/app-shell";
import { HistoryView } from "@/components/trips/history";
import { SignIn } from "@/components/auth/sign-in";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  return (
    <AppShell user={user}>
      {user ? (
        <HistoryView />
      ) : (
        <SignIn
          user={null}
          enabled={authConfig().enabled}
          returnTo="/history"
          callbackError={false}
        />
      )}
    </AppShell>
  );
}
