import { currentUser } from "@/lib/auth/server";
import { authConfig, platformAuth } from "@/lib/auth/config";
import { AppShell } from "@/components/trips/app-shell";
import { Workspace } from "@/components/trips/workspace";
import { SignIn } from "@/components/auth/sign-in";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  return (
    <AppShell user={user}>
      {user ? (
        <Workspace view="trips" signedIn />
      ) : (
        <SignIn
          user={null}
          enabled={authConfig().enabled}
        platform={await platformAuth()}
          returnTo="/trips"
          callbackError={false}
        />
      )}
    </AppShell>
  );
}
