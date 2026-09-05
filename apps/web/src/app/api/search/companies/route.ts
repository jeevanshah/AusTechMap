import { CompanySearchResponseSchema } from "@austechmap/contracts";

import { DatabaseNotConfiguredError, getPool } from "../../../../lib/db";
import { searchCompanies } from "../../../../lib/queries/searchCompanies";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) {
    return Response.json(
      { version: 1, error: "q is required" },
      { status: 400 },
    );
  }

  try {
    const results = await searchCompanies(getPool(), query);
    const body = CompanySearchResponseSchema.parse({
      version: 1,
      query,
      results,
    });
    return Response.json(body, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
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
