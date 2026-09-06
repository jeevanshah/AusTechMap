import type { Pool } from "pg";

import type { MapCompanyPoint } from "@austechmap/contracts";

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface MapCompaniesQuery {
  bbox: Bbox;
  category: string | null;
  sponsorship: boolean;
  regional: boolean;
}

const SPONSORSHIP_CLAIM_TYPES = [
  "sponsorship_current_explicit",
  "sponsorship_historical_explicit",
  "sponsorship_labour_agreement",
];

interface MapCompanyRow {
  slug: string;
  name: string;
  careers_url: string | null;
  lng: number;
  lat: number;
  location_type: "head_office" | "branch" | "remote_only";
  city: string | null;
  primary_category: string | null;
  has_sponsorship_evidence: boolean;
  is_regional: boolean;
}

const MAX_ROWS = 500;

/**
 * Bbox-filtered, minimal-field company points for the map. Deliberately not
 * server-side clustered -- ARCHITECTURE_DECISIONS.md §3.5 frames MapLibre
 * around client-side clustering of this dataset's actual scale (133-1,000
 * points), and MapLibre's built-in `cluster: true` GeoJSON source handles
 * that from exactly this payload shape.
 */
export async function fetchMapCompanies(
  pool: Pool,
  query: MapCompaniesQuery,
): Promise<{ points: MapCompanyPoint[]; truncated: boolean }> {
  const { rows } = await pool.query<MapCompanyRow>(
    `SELECT c.slug, c.display_name AS name, c.careers_url,
            ST_X(rl.point) AS lng, ST_Y(rl.point) AS lat, cl.location_type,
            research.claim_value ->> 'city' AS city,
            cat.label AS primary_category,
            EXISTS (
              SELECT 1 FROM evidence e2
              WHERE e2.entity_type = 'company' AND e2.entity_id = c.id::text
                AND e2.claim_type = ANY($7::text[])
            ) AS has_sponsorship_evidence,
            rl.migration_category IS NOT NULL AS is_regional
     FROM company_locations cl
     JOIN companies c ON c.id = cl.company_id
     JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
     LEFT JOIN LATERAL (
       SELECT e.claim_value
       FROM evidence e
       WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
         AND e.claim_type = 'employer_seed_research'
       ORDER BY e.observed_at DESC LIMIT 1
     ) research ON true
     LEFT JOIN LATERAL (
       SELECT cg.label
       FROM company_category_links ccl2
       JOIN categories cg ON cg.id = ccl2.category_id
       WHERE ccl2.company_id = c.id
       ORDER BY cg.label
       LIMIT 1
     ) cat ON true
     WHERE c.status NOT IN ('merged', 'disabled')
       AND rl.status = 'accepted'
       AND rl.point IS NOT NULL
       AND ST_Intersects(rl.point, ST_MakeEnvelope($1, $2, $3, $4, 4326))
       AND ($5::text IS NULL OR EXISTS (
             SELECT 1 FROM company_category_links ccl
             JOIN categories cat ON cat.id = ccl.category_id
             WHERE ccl.company_id = c.id AND cat.key = $5
           ))
       AND (NOT $6::boolean OR EXISTS (
             SELECT 1 FROM evidence e
             WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
               AND e.claim_type = ANY($7::text[])
           ))
       AND (NOT $8::boolean OR rl.migration_category IS NOT NULL)
     ORDER BY c.display_name
     LIMIT $9`,
    [
      query.bbox.west,
      query.bbox.south,
      query.bbox.east,
      query.bbox.north,
      query.category,
      query.sponsorship,
      SPONSORSHIP_CLAIM_TYPES,
      query.regional,
      MAX_ROWS + 1,
    ],
  );

  const truncated = rows.length > MAX_ROWS;
  const points: MapCompanyPoint[] = rows.slice(0, MAX_ROWS).map((row) => ({
    slug: row.slug,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    locationType: row.location_type,
    careersUrl: row.careers_url,
    city: row.city,
    primaryCategory: row.primary_category,
    hasSponsorshipEvidence: row.has_sponsorship_evidence,
    isRegional: row.is_regional,
  }));

  return { points, truncated };
}
