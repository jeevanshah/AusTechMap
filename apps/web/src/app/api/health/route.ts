import {
  HealthResponseSchema,
  type HealthResponse,
} from "@austechmap/contracts";

export function GET(): Response {
  const health: HealthResponse = {
    service: "web",
    status: "ok",
    version: 1,
  };

  return Response.json(HealthResponseSchema.parse(health));
}
