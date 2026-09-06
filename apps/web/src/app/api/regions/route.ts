import { RegionalHubsResponseSchema } from "@austechmap/contracts";

import { DatabaseNotConfiguredError, getPool } from "../../../lib/db";
import { listRegionalHubs } from "../../../lib/queries/listRegionalHubs";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const hubs = await listRegionalHubs(getPool());
    const body = RegionalHubsResponseSchema.parse({ version: 1, hubs });
    return Response.json(body, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
      },
    });
  } catch (caught) {
    if (caught instanceof DatabaseNotConfiguredError) {
      return Response.json(
        { version: 1, error: "database_not_configured" },
        { status: 503 },
      );
    }
    return Response.json(
      { version: 1, error: "internal_error" },
      { status: 500 },
    );
  }
}
