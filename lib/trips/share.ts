import { tripSchema, type Trip } from "./schema";
export function shareSnapshot(input: Trip) {
  const trip = tripSchema.parse(input);
  return { destination: trip.intake.destination, days: trip.intake.days, itinerary: trip.itinerary };
}
export type SharedTrip = ReturnType<typeof shareSnapshot>;
