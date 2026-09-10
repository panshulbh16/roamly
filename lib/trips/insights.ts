import type { Intake } from "./schema";

export type TripSignature = {
  name: string;
  line: string;
  signals: string[];
};

export function getTripSignature(intake: Pick<Intake, "days" | "budget" | "pace" | "interests">): TripSignature {
  const interests = new Set(intake.interests);
  const name =
    interests.has("Nature") && interests.has("Adventure")
      ? "Wild & wide"
      : interests.has("Food") && interests.has("Culture")
        ? "Taste & texture"
        : interests.has("Photography")
          ? "Light chaser"
          : interests.has("Relaxation")
            ? "Slow horizon"
            : "Curious original";
  const rhythm =
    intake.pace === "Relaxed"
      ? "room to wander"
      : intake.pace === "Packed"
        ? "full days, big energy"
        : "a steady rhythm";
  const budget =
    intake.budget === "Budget"
      ? "smart stays"
      : intake.budget === "Luxury"
        ? "treat-yourself stays"
        : "comfort-led stays";
  const focus = intake.interests.length
    ? intake.interests.slice(0, 2).join(" + ")
    : "Open discovery";
  return {
    name,
    line: `${intake.days}-day escape with ${rhythm} and ${budget}.`,
    signals: [focus, `${intake.days} ${intake.days === 1 ? "day" : "days"}`, intake.pace],
  };
}

export function getPackingCues(intake: Pick<Intake, "interests" | "needs">): string[] {
  const cues = new Set<string>(["A reusable water bottle", "One flexible day layer"]);
  const interests = new Set(intake.interests);
  if (/access|step-free|wheelchair/i.test(intake.needs)) {
    cues.add("Save accessibility notes offline");
  }
  if (interests.has("Nature") || interests.has("Adventure")) {
    cues.add("Comfortable shoes for changing ground");
  }
  if (interests.has("Food")) cues.add("A light tote for market finds");
  if (interests.has("Photography")) cues.add("A spare battery or power bank");
  if (interests.has("Relaxation")) cues.add("A book or offline playlist");
  return [...cues].slice(0, 6);
}
