import {
  HealthResponseSchema,
  type HealthResponse,
} from "@austechmap/contracts";
import { getPool } from "../../../lib/db";

export async function GET(request?: Request): Promise<Response> {
  const url = request ? new URL(request.url) : null;
  const isDeep = url?.searchParams.get("deep") === "true";

  if (!isDeep) {
    const health: HealthResponse = {
      service: "web",
      status: "ok",
      version: 1,
    };
    return Response.json(HealthResponseSchema.parse(health));
  }

  const start = performance.now();
  try {
    const pool = getPool();
    const result = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY version DESC LIMIT 1;",
    );
    const latencyMs = Math.round(performance.now() - start);

    const health: HealthResponse = {
      service: "web",
      status: "ok",
      version: 1,
      diagnostics: {
        database: "connected",
        latencyMs,
        latestMigration: result.rows[0]?.name || null,
      },
    };

    return Response.json(HealthResponseSchema.parse(health));
  } catch (err) {
    console.error("Health check failure:", err);
    const health: HealthResponse = {
      service: "web",
      status: "degraded",
      version: 1,
      diagnostics: {
        database: "disconnected",
      },
    };
    return Response.json(HealthResponseSchema.parse(health), { status: 503 });
  }
}
