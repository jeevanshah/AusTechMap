import { z } from "zod";

export const HealthResponseSchema = z.object({
  service: z.enum(["web", "ingestion"]),
  status: z.literal("ok"),
  version: z.literal(1),
  runId: z.string().min(1).optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
