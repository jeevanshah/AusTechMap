import { CategoriesResponseSchema } from "@austechmap/contracts";

import { DatabaseNotConfiguredError, getPool } from "../../../lib/db";
import { listCategories } from "../../../lib/queries/listCategories";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const categories = await listCategories(getPool());
    const body = CategoriesResponseSchema.parse({ version: 1, categories });
    return Response.json(body, {
      headers: {
        // Categories are a seeded taxonomy that changes rarely, unlike
        // company data -- a much longer cache than the map/search routes.
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
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
