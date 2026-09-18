import { intakeSchema, type Intake, type Itinerary } from "./schema";

// A local planning scaffold, never a verified destination itinerary or saved Trip.
export function starterItinerary(input: Intake): Itinerary {
  const trip = intakeSchema.parse(input);
  const ideas: Record<string, [string, string]> = {
    Nature: ["Make room for nature", "Choose a nearby green space after checking access and weather."],
    Food: ["Explore local food", "Choose a meal stop that fits your budget and dietary needs."],
    Culture: ["Plan a cultural stop", "Shortlist a museum or heritage site; confirm hours and entry."],
    Adventure: ["Consider an outdoor activity", "Choose an activity suited to your ability; verify conditions and operators."],
    Photography: ["Leave time for photos", "Pick a public viewpoint; confirm access and photography rules."],
    Relaxation: ["Keep an unhurried break", "Leave space to rest near your accommodation."],
  };
  const selected = trip.interests.filter(interest => ideas[interest]);
  const focus = selected.length ? selected : ["Culture", "Relaxation"];
  return {
    title: `Your ${trip.days}-day starter for ${trip.destination}`,
    summary: `A prebuilt ${trip.pace.toLowerCase()} outline for ${trip.travelers} ${trip.travelers === 1 ? "traveler" : "travelers"}. Places, routes and personal requirements still need checking.`,
    days: Array.from({ length: trip.days }, (_, i) => ({
      title: i === 0 ? "Settle in and explore nearby" : i === trip.days - 1 ? "A flexible final day" : `Explore at your own pace · Day ${i + 1}`,
      activities: Array.from({ length: trip.pace === "Relaxed" ? 2 : 3 }, (_, j) => {
        const [title, description] = ideas[focus[(i + j) % focus.length]];
        return { time: ["Morning", "Afternoon", "Evening"][j], title, description, place: "Place to be selected" };
      }),
    })),
    tips: ["Leave time for arrival, departure and travel between stops.", "This outline is not saved. The personalized itinerary will replace it when ready."],
  };
}
