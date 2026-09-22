import { currentUser } from "@/lib/auth/server";
import { hasPlus, membership } from "@/lib/billing/razorpay";
import { AppShell } from "@/components/trips/app-shell";
import { Together } from "@/components/trips/together";
export const dynamic="force-dynamic";
export const metadata={title:"Travel Together · Roamly",robots:{index:false,follow:false}};
export default async function Page(){
  const user=await currentUser();
  let plus=false, membershipUnavailable=false;
  try {plus=!!user && hasPlus(await membership(user.id));} catch {membershipUnavailable=true;}
  return <AppShell user={user}><Together signedIn={!!user} plus={plus} membershipUnavailable={membershipUnavailable}/></AppShell>;
}
