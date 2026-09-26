import { z } from "zod";
const short = (max: number) => z.string().trim().min(1).max(max);
export const outingSchema = z.object({
  id: z.string().uuid(), title: short(100), hostName: short(60),
  city: short(100), destination: short(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d=new Date(v+"T00:00:00Z"); return !isNaN(+d)&&d.toISOString().slice(0,10)===v; }),
  capacity: z.number().int().min(1).max(20),
  // Only the basics are required; the plan can be added now or later.
  summary: z.string().trim().max(1000), cost: z.number().int().min(0).max(1000000),
  days: z.array(z.string().trim().max(2000)).max(10).transform(days => days.filter(Boolean)),
  meeting: z.string().trim().max(2000),
});
export type OutingInput = z.infer<typeof outingSchema>;
export type Outing = Omit<OutingInput,"meeting"> & {status:string;isHost:boolean;approved:number;requestStatus:string|null;meeting?:string};
export type JoinRequest = {member:string;name:string;message:string;status:string};
export function upcoming(date:string) { return date >= new Date().toISOString().slice(0,10); }
