import { z } from "zod";
export const intakeSchema = z.object({
  destination: z.string().trim().min(2).max(120),
  startDate: z
    .string()
    .max(10)
    .refine(
      (v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))),
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
  title: z.string().max(160),
  summary: z.string().max(1000),
  days: z
    .array(
      z.object({
        title: z.string().max(160),
        activities: z
          .array(
            z.object({
              time: z.string().max(30),
              title: z.string().max(160),
              description: z.string().max(800),
              place: z.string().max(160),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(10),
  tips: z.array(z.string().max(500)).max(8),
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
