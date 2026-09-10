import { cookies } from "next/headers";
import { safeReturnTo } from "@/lib/auth/policy";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { failure, sameOrigin } from "@/lib/server/context";
function targetFrom(r: Request) {
  return safeReturnTo(new URL(r.url).searchParams.get("returnTo"));
}
export async function GET(r: Request) {
  const returnTo = targetFrom(r);
  return Response.redirect(new URL(chatGPTSignInPath(returnTo), r.url), 303);
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const jar = await cookies();
    jar.delete("roamly-signed-out");
    jar.delete("roamly-auth-provider");
    for (const cookie of jar.getAll())
      if (cookie.name.startsWith("sb-")) jar.delete(cookie.name);
    const returnTo = targetFrom(r);
    return Response.redirect(new URL(chatGPTSignInPath(returnTo), r.url), 303);
  } catch (e) {
    return failure(e);
  }
}
