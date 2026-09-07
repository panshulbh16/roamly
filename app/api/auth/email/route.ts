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
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const c = await requiredClient();
    const value = await body(r);
    const parsed = emailSchema.safeParse(value.email);
    if (!parsed.success)
      throw new ApiError(400, "Enter a valid email address.");
    await authRateLimit(parsed.data, "send");
    const { error } = await c.auth.signInWithOtp({
      email: parsed.data,
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
