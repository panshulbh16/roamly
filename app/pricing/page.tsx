import { headers } from "next/headers";
import { billingReady, billingCurrency, PRICES } from "@/lib/billing/razorpay";
import { currentUser } from "@/lib/auth/server";
import { AppShell } from "@/components/trips/app-shell";
import { Pricing } from "@/components/trips/pricing";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await currentUser();
  return (
    <AppShell user={u}>
      <Pricing signedIn={!!u} billingEnabled={billingReady()} price={PRICES[billingCurrency((await headers()).get("cf-ipcountry"))].label} />
    </AppShell>
  );
}
