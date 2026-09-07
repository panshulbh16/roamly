import {
  body,
  failure,
  identity,
  privateHeaders,
  sameOrigin,
  ApiError,
} from "@/lib/server/context";
import { intakeSchema } from "@/lib/trips/schema";
import { AnthropicPlanner, reserveUsage } from "@/lib/server/planner";
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const u = await identity();
    const parsed = intakeSchema.safeParse(await body(r));
    if (!parsed.success)
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? "Please check your trip details.",
      );
    await reserveUsage(u.id);
    const itinerary = await new AnthropicPlanner().generate(parsed.data);
    return Response.json(
      {
        trip: {
          id: crypto.randomUUID(),
          intake: parsed.data,
          itinerary,
          source: "ai",
          createdAt: new Date().toISOString(),
        },
      },
      { headers: privateHeaders },
    );
  } catch (e) {
    return failure(e);
  }
}
