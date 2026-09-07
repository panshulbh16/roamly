import { cookies } from "next/headers";
import { authClient } from "@/lib/auth/server";
import { authCookieOptions } from "@/lib/auth/config";
import {
  failure,
  sameOrigin,
  privateHeaders,
  ApiError,
} from "@/lib/server/context";
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const c = await authClient(true);
    if (c) {
      const { error } = await c.auth.signOut({ scope: "local" });
      if (error && error.status !== 401 && error.status !== 403)
        throw new ApiError(
          502,
          "Sign-out could not complete. Please try again.",
        );
    }
    const jar = await cookies();
    for (const cookie of jar.getAll())
      if (cookie.name.startsWith("sb-")) jar.delete(cookie.name);
    jar.set("roamly-signed-out", "1", {
      ...authCookieOptions,
      maxAge: 31536000,
    });
    return Response.json({ signedOut: true }, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
}
