import { z } from "zod";
import { body, identity, sameOrigin, failure, ApiError, privateHeaders } from "@/lib/server/context";
import { tripSchema } from "@/lib/trips/schema";
import { resolveDestination } from "@/lib/trips/destinations.server";
import { AnthropicPlanner, reserveUsage } from "@/lib/server/planner";
export async function POST(r:Request) {
  try {
    sameOrigin(r);
    const user = await identity();
    const parsed = z.object({trip:tripSchema,day:z.number().int().min(0).max(9)}).safeParse(await body(r));
    if(!parsed.success || parsed.data.day >= parsed.data.trip.itinerary.days.length) throw new ApiError(400,"Choose a valid day.");
    const {trip,day} = parsed.data;
    if(!resolveDestination(trip.intake.destination)) throw new ApiError(422,"Choose a listed destination.");
    await reserveUsage(user.id);
    let startDate=trip.intake.startDate;
    if(startDate) {const date=new Date(startDate+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+day);startDate=date.toISOString().slice(0,10);}
    const itinerary=await new AnthropicPlanner().generate({...trip.intake,days:1,startDate},undefined,r.signal,{dayNumber:day+1,otherDays:trip.itinerary.days.filter((_,i)=>i!==day).flatMap(d=>d.activities.map(a=>a.place+": "+a.title))});
    return Response.json({day:itinerary.days[0]},{headers:privateHeaders});
  } catch(e){return failure(e);}
}
