import type { Pool } from "pg";

import type { CompanySearchResult } from "@austechmap/contracts";

interface TrigramRow {
  slug: string;
  name: string;
  domain: string | null;
  name_score: number;
  alias_score: number | null;
  matched_alias: string | null;
  city: string | null;
  primary_category: string | null;
  has_sponsorship_evidence: boolean;
  is_regional: boolean;
}

interface LocationRow {
  slug: string;
  name: string;
  domain: string | null;
  input_text: string;
  city: string | null;
  primary_category: string | null;
  has_sponsorship_evidence: boolean;
  is_regional: boolean;
}

const SIGNAL_COLUMNS_SQL = `research.claim_value ->> 'city' AS city,
            cat.label AS primary_category,
            EXISTS (
              SELECT 1 FROM evidence e2
              WHERE e2.entity_type = 'company' AND e2.entity_id = c.id::text
                AND e2.claim_type = ANY($4::text[])
            ) AS has_sponsorship_evidence,
            EXISTS (
              SELECT 1 FROM company_locations cl2
              JOIN resolved_locations rl2 ON rl2.id = cl2.resolved_location_id
              WHERE cl2.company_id = c.id AND rl2.migration_category IS NOT NULL
            ) AS is_regional`;

const SIGNAL_JOINS_SQL = `LEFT JOIN LATERAL (
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
     ) cat ON true`;

const LOCATION_FALLBACK_SCORE = 0.5;

/**
 * Company-name/alias trigram search, with a free-text location fallback
 * (matched against resolved_locations.input_text) when nothing matches by
 * name/alias -- a stopgap for suburb/city text search until Phase 2's
 * structured region/postcode data is imported, not a real geography
 * resolver.
 */
const CATEGORY_FILTER_SQL = `($2::text IS NULL OR EXISTS (
             SELECT 1 FROM company_category_links ccl
             JOIN categories cat ON cat.id = ccl.category_id
             WHERE ccl.company_id = c.id AND cat.key = $2
           ))`;

const SPONSORSHIP_FILTER_SQL = `(NOT $3::boolean OR EXISTS (
             SELECT 1 FROM evidence e
             WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
               AND e.claim_type = ANY($4::text[])
           ))`;

const REGIONAL_FILTER_SQL = `(NOT $5::boolean OR EXISTS (
             SELECT 1 FROM company_locations cl2
             JOIN resolved_locations rl2 ON rl2.id = cl2.resolved_location_id
             WHERE cl2.company_id = c.id AND rl2.migration_category IS NOT NULL
           ))`;

const SPONSORSHIP_CLAIM_TYPES = [
  "sponsorship_current_explicit",
  "sponsorship_historical_explicit",
  "sponsorship_labour_agreement",
];

export async function searchCompanies(
  pool: Pool,
  query: string,
  category: string | null = null,
  sponsorship = false,
  regional = false,
): Promise<CompanySearchResult[]> {
  const filterParams = [
    category,
    sponsorship,
    SPONSORSHIP_CLAIM_TYPES,
    regional,
  ];
  const { rows } = await pool.query<TrigramRow>(
    `SELECT c.slug, c.display_name AS name, c.domain,
            similarity(c.display_name, $1) AS name_score,
            alias_sim.best AS alias_score,
            alias_sim.best_alias AS matched_alias,
            ${SIGNAL_COLUMNS_SQL}
     FROM companies c
     LEFT JOIN LATERAL (
       SELECT ca.alias AS best_alias, similarity(ca.alias, $1) AS best
       FROM company_aliases ca
       WHERE ca.company_id = c.id
       ORDER BY similarity(ca.alias, $1) DESC
       LIMIT 1
     ) alias_sim ON true
     ${SIGNAL_JOINS_SQL}
     WHERE c.status NOT IN ('merged', 'disabled')
       AND (c.display_name % $1 OR EXISTS (
             SELECT 1 FROM company_aliases ca
             WHERE ca.company_id = c.id AND ca.alias % $1
           ))
       AND ${CATEGORY_FILTER_SQL}
       AND ${SPONSORSHIP_FILTER_SQL}
       AND ${REGIONAL_FILTER_SQL}
     ORDER BY GREATEST(similarity(c.display_name, $1), COALESCE(alias_sim.best, 0)) DESC
     LIMIT 20`,
    [query, ...filterParams],
  );

  if (rows.length > 0) {
    return rows.map((row) => {
      const aliasScore = row.alias_score ?? 0;
      if (aliasScore > row.name_score) {
        return {
          slug: row.slug,
          name: row.name,
          domain: row.domain,
          matchType: "alias" as const,
          matchedText: row.matched_alias,
          score: aliasScore,
          city: row.city,
          primaryCategory: row.primary_category,
          hasSponsorshipEvidence: row.has_sponsorship_evidence,
          isRegional: row.is_regional,
        };
      }
      return {
        slug: row.slug,
        name: row.name,
        domain: row.domain,
        matchType: "name" as const,
        matchedText: null,
        score: row.name_score,
        city: row.city,
        primaryCategory: row.primary_category,
        hasSponsorshipEvidence: row.has_sponsorship_evidence,
        isRegional: row.is_regional,
      };
    });
  }

  const { rows: locationRows } = await pool.query<LocationRow>(
    `SELECT DISTINCT ON (c.id) c.slug, c.display_name AS name, c.domain, rl.input_text,
            ${SIGNAL_COLUMNS_SQL}
     FROM company_locations cl
     JOIN companies c ON c.id = cl.company_id
     JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
     ${SIGNAL_JOINS_SQL}
     WHERE c.status NOT IN ('merged', 'disabled')
       AND rl.input_text ILIKE '%' || $1 || '%'
       AND ${CATEGORY_FILTER_SQL}
       AND ${SPONSORSHIP_FILTER_SQL}
       AND ${REGIONAL_FILTER_SQL}
     ORDER BY c.id
     LIMIT 20`,
    [query, ...filterParams],
  );

  return locationRows.map((row) => ({
    slug: row.slug,
    name: row.name,
    domain: row.domain,
    matchType: "location" as const,
    matchedText: row.input_text,
    score: LOCATION_FALLBACK_SCORE,
    city: row.city,
    primaryCategory: row.primary_category,
    hasSponsorshipEvidence: row.has_sponsorship_evidence,
    isRegional: row.is_regional,
  }));
}
