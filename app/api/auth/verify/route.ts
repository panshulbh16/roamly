import { authCookieOptions } from "@/lib/auth/config";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  body,
  failure,
  sameOrigin,
  ApiError,
  privateHeaders,
} from "@/lib/server/context";
import {
  emailSchema,
  requiredClient,
  authRateLimit,
} from "@/lib/auth/requests";
import { safeReturnTo } from "@/lib/auth/policy";
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const c = await requiredClient();
    const parsed = z
      .object({
        email: emailSchema,
        token: z.string().regex(/^\d{6,8}$/),
        returnTo: z.string().optional(),
      })
      .safeParse(await body(r));
    if (!parsed.success)
      throw new ApiError(400, "Enter the code from your email.");
    await authRateLimit(parsed.data.email, "verify");
    const { data, error } = await c.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.token,
      type: "email",
    });
    if (error || !data.user)
      throw new ApiError(
        400,
        "This code is invalid or expired. Request a new code and try again.",
      );
    const jar = await cookies();
    jar.delete("roamly-signed-out");
    jar.set("roamly-auth-provider", "supabase", {
      ...authCookieOptions,
      maxAge: 31536000,
    });
    return Response.json(
      { redirectTo: safeReturnTo(parsed.data.returnTo) },
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}
