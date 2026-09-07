import { currentUser } from "@/lib/auth/server";
import { authConfig } from "@/lib/auth/config";
import { safeReturnTo } from "@/lib/auth/policy";
import { AppShell } from "@/components/trips/app-shell";
import { SignIn } from "@/components/auth/sign-in";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, query] = await Promise.all([currentUser(), searchParams]);
  return (
    <AppShell user={user}>
      <SignIn
        user={user}
        enabled={authConfig().enabled}
        returnTo={safeReturnTo(query.returnTo)}
        callbackError={query.error === "callback"}
      />
    </AppShell>
  );
}
