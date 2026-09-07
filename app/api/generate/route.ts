import {
  body,
  db,
  failure,
  identity,
  privateHeaders,
  sameOrigin,
  ApiError,
} from "@/lib/server/context";
import { intakeSchema, type Trip } from "@/lib/trips/schema";
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
    const u = await identity();
    owner = u.id;
    const parsed = intakeSchema.safeParse(await body(r));
    if (!parsed.success)
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Please check your trip details.",
      );
    searchId = await startSearch(db(), u.id, parsed.data);
    await reserveUsage(u.id);
    const itinerary = await new AnthropicPlanner().generate(parsed.data);
    const trip: Trip = {
      id: crypto.randomUUID(),
      intake: parsed.data,
      itinerary,
      source: "ai",
      createdAt: new Date().toISOString(),
    };
    await completeSearch(db(), u.id, searchId, trip);
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
