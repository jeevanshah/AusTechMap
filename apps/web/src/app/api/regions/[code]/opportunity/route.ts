import { RegionOpportunityResponseSchema } from "@austechmap/contracts";

import { DatabaseNotConfiguredError, getPool } from "../../../../../lib/db";
import { getRegionOpportunity } from "../../../../../lib/queries/getRegionOpportunity";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ code: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const { code } = await context.params;
    const opportunity = await getRegionOpportunity(getPool(), code);
    if (!opportunity) {
      return Response.json(
        { version: 1, error: "region_not_found" },
        { status: 404 },
      );
    }
    const body = RegionOpportunityResponseSchema.parse({
      version: 1,
      ...opportunity,
    });
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
