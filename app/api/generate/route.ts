import {
  body,
  db,
  failure,
  privateHeaders,
  sameOrigin,
  ApiError,
} from "@/lib/server/context";
import { currentUser } from "@/lib/auth/server";
import { intakeSchema, type Trip } from "@/lib/trips/schema";
import { resolveDestination, suggestDestinations } from "@/lib/trips/destinations.server";
import type { PlannerEvent } from "@/lib/trips/stream";
import { AnthropicPlanner, reserveUsage } from "@/lib/server/planner";
import {
  startSearch,
  completeSearch,
  failSearch,
} from "@/lib/history/repository";
export async function POST(r: Request) {
  let searchId: string | null = null;
  let owner: string | null = null;
  try {
    sameOrigin(r);
    const u = await currentUser();
    owner = u?.id ?? null;
    const parsed = intakeSchema.safeParse(await body(r));
    if (!parsed.success)
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Please check your trip details.",
      );
    const destination = resolveDestination(parsed.data.destination);
    if (!destination) {
      const suggestions = suggestDestinations(parsed.data.destination).map((match) => match.name);
      throw new ApiError(422, suggestions.length
        ? `Choose a listed destination. Did you mean: ${suggestions.join(", ")}?`
        : "We could not find that city, town, country, or continent. Choose a listed destination.");
    }
    if (u) searchId = await startSearch(db(), u.id, parsed.data);
    // Cloudflare supplies this header at the edge. No raw addresses are stored.
    // Missing edge metadata shares a bounded guest bucket instead of bypassing limits.
    const guestHash = u ? "" : Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
      new TextEncoder().encode(`${new Date().toISOString().slice(0, 10)}:${r.headers.get("cf-connecting-ip") ?? "unknown"}`))), b => b.toString(16).padStart(2, "0")).join("");
    await reserveUsage(u?.id ?? `guest:${guestHash}`);
    if (r.headers.get("accept")?.includes("application/x-ndjson")) {
      const id = searchId;
      const abort = new AbortController();
      const signal = AbortSignal.any([r.signal, abort.signal]);
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        async start(controller) {
          const send = (event: PlannerEvent) => {
            if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          };
          try {
            const itinerary = await new AnthropicPlanner().generate(parsed.data,
              (itinerary) => send({ type: "preview", itinerary }), signal);
            signal.throwIfAborted();
            const trip: Trip = { id: crypto.randomUUID(), intake: parsed.data, itinerary, source: "ai", createdAt: new Date().toISOString() };
            if (u && id) await completeSearch(db(), u.id, id, trip);
            send({ type: "complete", trip, historyId: id });
          } catch (e) {
            const error = e instanceof ApiError ? e.message : "Generation did not finish. Your input is still here; please try again.";
            if (u && id) try { await failSearch(db(), u.id, id, error); } catch { console.error("history_update_failed"); }
            send({ type: "error", error });
          } finally {
            if (!abort.signal.aborted) controller.close();
          }
        },
        cancel() { abort.abort(); },
      }), { headers: { ...privateHeaders, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no" } });
    }
    const itinerary = await new AnthropicPlanner().generate(parsed.data);
    const trip: Trip = {
      id: crypto.randomUUID(),
      intake: parsed.data,
      itinerary,
      source: "ai",
      createdAt: new Date().toISOString(),
    };
    if (u && searchId) await completeSearch(db(), u.id, searchId, trip);
    return Response.json(
      { trip, historyId: searchId },
      { headers: privateHeaders },
    );
  } catch (e) {
    if (searchId && owner) {
      try {
        await failSearch(
          db(),
          owner,
          searchId,
          e instanceof ApiError
            ? e.message
            : "Generation did not finish. Open this search to try again.",
        );
      } catch {
        console.error("history_update_failed");
      }
    }
    return failure(e);
  }
}
