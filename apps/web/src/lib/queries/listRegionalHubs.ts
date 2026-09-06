import type { Pool } from "pg";

import type { RegionalHub } from "@austechmap/contracts";

interface RegionalHubRow {
  city: string;
  count: string;
}

/**
 * Real per-city counts of companies with a Home Affairs designated-regional
 * location (Phase 2's migration_category, populated for real on 5 September
 * 2026) -- replaces any hand-authored "regional hub" list with a count
 * actually derived from `resolved_locations`. `city` is the same free-text
 * field `mapCompanies.ts`/`searchCompanies.ts` already surface (sourced from
 * `employer_seed_research` evidence), not a structured region name -- a
 * proper SA4-based region breakdown is Track 6B's job, not this one.
 */
export async function listRegionalHubs(pool: Pool): Promise<RegionalHub[]> {
  const { rows } = await pool.query<RegionalHubRow>(
    `SELECT research.claim_value ->> 'city' AS city, COUNT(DISTINCT c.id) AS count
     FROM companies c
     JOIN company_locations cl ON cl.company_id = c.id
     JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
     LEFT JOIN LATERAL (
       SELECT e.claim_value
       FROM evidence e
       WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
         AND e.claim_type = 'employer_seed_research'
       ORDER BY e.observed_at DESC LIMIT 1
     ) research ON true
     WHERE c.status NOT IN ('merged', 'disabled')
       AND rl.migration_category IS NOT NULL
       AND research.claim_value ->> 'city' IS NOT NULL
     GROUP BY research.claim_value ->> 'city'
     ORDER BY count DESC, city ASC`,
  );

  return rows.map((row) => ({ city: row.city, count: Number(row.count) }));
}
