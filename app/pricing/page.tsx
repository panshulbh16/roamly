import { headers } from "next/headers";
import { billingReady, paymentRoute, PRICES } from "@/lib/billing/razorpay";
import { currentUser } from "@/lib/auth/server";
import { AppShell } from "@/components/trips/app-shell";
import { Pricing } from "@/components/trips/pricing";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await currentUser();
  const route = paymentRoute((await headers()).get("cf-ipcountry")); // the same choice checkout makes
  return (
    <AppShell user={u}>
      <Pricing signedIn={!!u} billingEnabled={billingReady()} price={PRICES[route.currency].label} via={({ razorpay: "Razorpay", stripe: "Stripe", dodo: "Dodo Payments" } as const)[route.provider]} />
    </AppShell>
  );
}
