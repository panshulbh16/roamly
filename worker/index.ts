/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /** Commit SHA set by CI at deploy time (`wrangler deploy --var GIT_SHA:...`). */
  GIT_SHA?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    const response = await handler.fetch(request, env, ctx);
    const secured = new Response(response.body, response);
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    secured.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    const publicDestination = url.pathname === "/api/destinations" && request.method === "GET" && response.status === 200 && !response.headers.has("Set-Cookie");
    if ((url.pathname.startsWith("/api/") && !publicDestination) || url.pathname.startsWith("/share/"))
      secured.headers.set("Cache-Control", "private, no-store");
    if (url.pathname.startsWith("/share/")) secured.headers.set("Referrer-Policy", "no-referrer");
    // Pages are never cached anywhere, so a deploy is visible on the next request. Hashed /assets/ stay immutable.
    if (secured.headers.get("Content-Type")?.startsWith("text/html")) secured.headers.set("Cache-Control", "private, no-store");
    // Lets CI (and anyone) confirm which commit is live.
    if (env.GIT_SHA) secured.headers.set("X-Roamly-Version", env.GIT_SHA);
    return secured;
  },
};

export default worker;
