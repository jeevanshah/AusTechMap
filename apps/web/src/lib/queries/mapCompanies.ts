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
}

interface MapCompanyRow {
  slug: string;
  name: string;
  careers_url: string | null;
  lng: number;
  lat: number;
  location_type: "head_office" | "branch" | "remote_only";
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
            ST_X(rl.point) AS lng, ST_Y(rl.point) AS lat, cl.location_type
     FROM company_locations cl
     JOIN companies c ON c.id = cl.company_id
     JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
     WHERE c.status NOT IN ('merged', 'disabled')
       AND rl.status = 'accepted'
       AND rl.point IS NOT NULL
       AND ST_Intersects(rl.point, ST_MakeEnvelope($1, $2, $3, $4, 4326))
       AND ($5::text IS NULL OR EXISTS (
             SELECT 1 FROM company_category_links ccl
             JOIN categories cat ON cat.id = ccl.category_id
             WHERE ccl.company_id = c.id AND cat.key = $5
           ))
     ORDER BY c.display_name
     LIMIT $6`,
    [
      query.bbox.west,
      query.bbox.south,
      query.bbox.east,
      query.bbox.north,
      query.category,
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
  }));

  return { points, truncated };
}
