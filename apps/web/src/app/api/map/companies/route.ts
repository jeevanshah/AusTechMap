import { MapCompaniesResponseSchema } from "@austechmap/contracts";

import { DatabaseNotConfiguredError, getPool } from "../../../../lib/db";
import { fetchMapCompanies } from "../../../../lib/queries/mapCompanies";
import { parseBboxParams } from "./bbox";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const parsed = parseBboxParams(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return Response.json({ version: 1, error: parsed.error }, { status: 400 });
  }

  try {
    const { points, truncated } = await fetchMapCompanies(getPool(), {
      bbox: parsed.params.bbox,
      category: parsed.params.category,
      sponsorship: parsed.params.sponsorship,
    });
    const body = MapCompaniesResponseSchema.parse({
      version: 1,
      bbox: parsed.params.bbox,
      points,
      truncated,
    });
    return Response.json(body, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
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
