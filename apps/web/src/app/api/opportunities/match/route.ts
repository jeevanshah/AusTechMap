import {
  OpportunityMatchPreferencesSchema,
  OpportunityMatchResponseSchema,
} from "@austechmap/contracts";

import { DatabaseNotConfiguredError, getPool } from "../../../../lib/db";
import { matchOpportunities } from "../../../../lib/opportunity/matcher";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { version: 1, error: "invalid_json_body" },
      { status: 400 },
    );
  }

  const parsed = OpportunityMatchPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        version: 1,
        error: "invalid_preferences",
        details: parsed.error.format(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await matchOpportunities(getPool(), parsed.data);
    const validated = OpportunityMatchResponseSchema.parse(result);

    return Response.json(validated, {
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
    console.error("Opportunity matching error:", caught);
    return Response.json(
      { version: 1, error: "internal_error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const roleFamily = url.searchParams.get("roleFamily") ?? undefined;
  const skills = url.searchParams.getAll("skills");
  const experienceBand = (url.searchParams.get("experienceBand") ?? "any") as
    | "entry"
    | "mid"
    | "senior"
    | "lead_principal"
    | "any";
  const locations = url.searchParams.getAll("locations");
  const locationRequired = url.searchParams.get("locationRequired") === "true";
  const workStyle = (url.searchParams.get("workStyle") ?? "any") as
    | "onsite"
    | "hybrid"
    | "remote"
    | "any";
  const workStyleRequired =
    url.searchParams.get("workStyleRequired") === "true";
  const requiresSponsorship =
    url.searchParams.get("requiresSponsorship") === "true";
  const prefersRegional = url.searchParams.get("prefersRegional") === "true";
  const limitStr = url.searchParams.get("limit");
  const limit = limitStr ? Number.parseInt(limitStr, 10) : 20;

  const preferences = OpportunityMatchPreferencesSchema.parse({
    roleFamily,
    skills,
    experienceBand,
    locations,
    locationRequired,
    workStyle,
    workStyleRequired,
    requiresSponsorship,
    prefersRegional,
    limit,
  });

  try {
    const result = await matchOpportunities(getPool(), preferences);
    const validated = OpportunityMatchResponseSchema.parse(result);

    return Response.json(validated, {
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
    console.error("Opportunity matching error:", caught);
    return Response.json(
      { version: 1, error: "internal_error" },
      { status: 500 },
    );
  }
}
