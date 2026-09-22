import { currentUser } from "@/lib/auth/server";
import { env } from "cloudflare:workers";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function db() {
  if (!env.DB)
    throw new ApiError(
      503,
      "Trip storage is temporarily unavailable. Please try again.",
    );
  return env.DB;
}
export async function identity() {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Please sign in to continue.");
  return user;
}
export function sameOrigin(r: Request) {
  const origin = r.headers.get("origin");
  if (origin !== new URL(r.url).origin)
    throw new ApiError(
      403,
      "This request could not be verified. Refresh and try again.",
    );
}
export async function rawBody(r: Request) {
  const reader = r.body?.getReader();
  if (!reader) throw new ApiError(400, "Please check the form and try again.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 96000) {
        await reader.cancel();
        throw new ApiError(413, "This request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}
export async function body(r: Request) {
  const bytes = await rawBody(r);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "Please check the form and try again.");
  }
}
export function failure(e: unknown) {
  if (e instanceof ApiError)
    return Response.json(
      { error: e.message },
      { status: e.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error("request_failed", e instanceof Error ? e.name : "unknown");
  return Response.json(
    {
      error:
        "We could not complete that request. Your input is still here; please try again.",
    },
    { status: 500 },
  );
}
export const privateHeaders = { "Cache-Control": "private, no-store" };
