/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { CLIENT_HEADER, CLIENT_ID } from "../lib/client/api";

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

const CANONICAL_HOST = "heyroamly.com";
// Old addresses send page visits to heyroamly.com. /api/ stays served on them, so integrations
// registered with the old URL (e.g. the Razorpay webhook) keep working.
const REDIRECT_HOSTS = new Set(["www.heyroamly.com", "roamly.panshulbh16.workers.dev"]);
// The API only serves Roamly's own pages, which send CLIENT_HEADER (lib/client/api.ts). A typed-in API address,
// another site or a bare script gets the same 404 as a missing route. Razorpay's checkout callback (a cross-site
// form post) and webhook (server to server) are the only doors from outside; each verifies Razorpay's signature.
const EXTERNAL_API = new Set(["/api/billing/callback", "/api/billing/webhook"]);
function hiddenApi(request: Request, pathname: string) {
  let path = pathname;
  try { path = decodeURIComponent(pathname); } catch { /* malformed: judged as sent */ }
  path = path.replace(/\/{2,}/g, "/").toLowerCase(); // so /%61pi/ or //api/ can't route around the check
  if (!(path.startsWith("/api/") || path === "/api") || EXTERNAL_API.has(path)) return false;
  const site = request.headers.get("sec-fetch-site");
  return request.headers.get(CLIENT_HEADER) !== CLIENT_ID || (!!site && site !== "same-origin");
}

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (REDIRECT_HOSTS.has(url.hostname) && (request.method === "GET" || request.method === "HEAD") && !url.pathname.startsWith("/api/")) {
      url.protocol = "https:";
      url.hostname = CANONICAL_HOST;
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }

    if (hiddenApi(request, url.pathname))
      return Response.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });

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
    // HTTPS only, and no other site may frame Roamly to trick clicks on Pay, Join or Accept.
    // ChatGPT's own hosting (*.chatgpt.site) is left able to embed it.
    secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (!url.hostname.endsWith(".chatgpt.site")) {
      secured.headers.set("X-Frame-Options", "DENY");
      const csp = secured.headers.get("Content-Security-Policy");
      secured.headers.set("Content-Security-Policy", csp ? `${csp}; frame-ancestors 'none'` : "frame-ancestors 'none'");
    }
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

  // Every 15 minutes (wrangler.jsonc): seal rows stored before DATA_ENCRYPTION_KEY was set.
  async scheduled(_controller: unknown, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(import("../lib/server/backfill").then((m) => m.sealLegacyData()).then(
      (sealed) => { if (sealed) console.log("sealed_legacy_rows", sealed); },
      (e) => console.error("seal_legacy_failed", e instanceof Error ? e.name : "unknown"),
    ));
  },
};

export default worker;
