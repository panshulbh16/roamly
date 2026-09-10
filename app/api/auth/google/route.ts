import { cookies } from "next/headers";
import {
  body,
  failure,
  sameOrigin,
  ApiError,
  privateHeaders,
} from "@/lib/server/context";
import { requiredClient } from "@/lib/auth/requests";
import { safeReturnTo } from "@/lib/auth/policy";
import { authCookieOptions } from "@/lib/auth/config";
import { z } from "zod";
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const c = await requiredClient();
    const parsed = z
      .object({ returnTo: z.string().optional() })
      .safeParse(await body(r));
    if (!parsed.success) throw new ApiError(400, "Please try signing in again.");
    const returnTo = safeReturnTo(parsed.data.returnTo);
    (await cookies()).set("roamly-auth-return", returnTo, {
      ...authCookieOptions,
      maxAge: 600,
    });
    const callback = new URL("/auth/callback", r.url).toString();
    const { data: result, error } = await c.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback, skipBrowserRedirect: true },
    });
    if (error || !result.url)
      throw new ApiError(
        502,
        "Google sign-in could not start. Please try again.",
      );
    return Response.json({ url: result.url }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
