import { z } from "zod";
const text = z.string().trim().min(1);
export const intakeSchema = z.object({
  destination: z.string().trim().min(2).max(120),
  startDate: z
    .string()
    .max(10)
    .refine(
      (v) => {
        if (!v) return true;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
        const [year, month, day] = v.split("-").map(Number);
        if (year < 1 || month < 1 || month > 12 || day < 1) return false;
        return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
      },
      "Choose a valid date",
    ),
  days: z.number().int().min(1).max(10),
  travelers: z.number().int().min(1).max(10),
  budget: z.enum(["Budget", "Comfort", "Luxury"]),
  pace: z.enum(["Relaxed", "Balanced", "Packed"]),
  interests: z.array(z.string().max(35)).max(8),
  needs: z.string().max(600),
  homeCity: z.string().max(100),
});
export const itinerarySchema = z.object({
  title: text.max(160),
  summary: text.max(1000),
  days: z
    .array(
      z.object({
        title: text.max(160),
        activities: z
          .array(
            z.object({
              time: text.max(30),
              title: text.max(160),
              description: text.max(800),
              place: text.max(160),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(10),
  tips: z.array(text.max(500)).max(8),
});
export const tripSchema = z.object({
  id: z.string().uuid(),
  intake: intakeSchema,
  itinerary: itinerarySchema,
  source: z.enum(["sample", "ai"]),
  createdAt: z.string().max(50),
});
export type Intake = z.infer<typeof intakeSchema>;
export type Itinerary = z.infer<typeof itinerarySchema>;
export type Trip = z.infer<typeof tripSchema>;
