import { cookies } from "next/headers";
import { safeReturnTo } from "@/lib/auth/policy";
import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { ApiError, failure, sameOrigin } from "@/lib/server/context";
import { platformAuth } from "@/lib/auth/config";
const notHere = () => failure(new ApiError(404, "ChatGPT sign-in is not available on this site."));
function targetFrom(r: Request) {
  return safeReturnTo(new URL(r.url).searchParams.get("returnTo"));
}
export async function GET(r: Request) {
  if (!(await platformAuth())) return notHere();
  const returnTo = targetFrom(r);
  return Response.redirect(new URL(chatGPTSignInPath(returnTo), r.url), 303);
}
export async function POST(r: Request) {
  if (!(await platformAuth())) return notHere();
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
