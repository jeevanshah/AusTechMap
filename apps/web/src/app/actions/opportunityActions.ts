"use server";

import {
  type OpportunityMatchPreferences,
  OpportunityMatchPreferencesSchema,
  type OpportunityMatchResponse,
  OpportunityMatchResponseSchema,
} from "@austechmap/contracts";

import { getPool } from "../../lib/db";
import { matchOpportunities } from "../../lib/opportunity/matcher";
import { getActiveSponsoredPlacements } from "../../lib/commercial/sponsored";
import type { SponsoredPlacement } from "@austechmap/contracts";

export async function matchOpportunitiesAction(
  rawPreferences: OpportunityMatchPreferences,
): Promise<{
  success: boolean;
  response?: OpportunityMatchResponse;
  promotedPlacements?: SponsoredPlacement[];
  error?: string;
}> {
  try {
    const preferences = OpportunityMatchPreferencesSchema.parse(rawPreferences);
    const pool = getPool();
    const result = await matchOpportunities(pool, preferences);
    const validated = OpportunityMatchResponseSchema.parse(result);
    const promoted = await getActiveSponsoredPlacements(pool, {
      roleFamily: preferences.roleFamily,
    });

    return {
      success: true,
      response: validated,
      promotedPlacements: promoted,
    };
  } catch (error) {
    console.error("Failed to run opportunity match action:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to compute opportunity matches",
    };
  }
}
