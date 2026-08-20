import { z } from "zod";

export const TRIGGER_TYPES = ["RAIN", "EXTREME_WIND", "FROST", "DROUGHT"] as const;
export const triggerTypeSchema = z.enum(TRIGGER_TYPES);

export const locationCreateSchema = z.object({
  label: z.string().min(1, "label is required"),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z.string().min(1).default("UTC"),
  units: z.enum(["metric", "imperial"]).default("metric"),
  triggers: z.array(triggerTypeSchema).min(1, "at least one trigger type is required"),
});

export const locationUpdateSchema = z
  .object({
    label: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    timezone: z.string().min(1),
    units: z.enum(["metric", "imperial"]),
    triggers: z.array(triggerTypeSchema).min(1),
    active: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "at least one field must be provided" });

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type LocationCreateInput = z.infer<typeof locationCreateSchema>;
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;