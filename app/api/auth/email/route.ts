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
import { z } from "zod";
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const c = await requiredClient();
    const parsed = z.object({ email: emailSchema }).safeParse(await body(r));
    if (!parsed.success)
      throw new ApiError(400, "Enter a valid email address.");
    await authRateLimit(parsed.data.email, "send");
    const { error } = await c.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: true },
    });
    if (error)
      throw new ApiError(
        error.status === 429 ? 429 : 502,
        "We could not send a sign-in code. Please try again shortly.",
      );
    return Response.json({ sent: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
