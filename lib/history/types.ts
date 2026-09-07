import type { Intake, Trip } from "@/lib/trips/schema";
export type HistoryEntry = {
  id: string;
  intake: Intake;
  trip: Trip | null;
  status: "pending" | "completed" | "failed";
  error: string | null;
  createdAt: string;
};
