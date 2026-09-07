import { cookies } from "next/headers";
import { safeReturnTo } from "@/lib/auth/policy";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
export async function GET(r: Request) {
  const jar = await cookies();
  jar.delete("roamly-signed-out");
  jar.delete("roamly-auth-provider");
  for (const cookie of jar.getAll())
    if (cookie.name.startsWith("sb-")) jar.delete(cookie.name);
  const returnTo = safeReturnTo(new URL(r.url).searchParams.get("returnTo"));
  return Response.redirect(new URL(chatGPTSignInPath(returnTo), r.url), 303);
}
