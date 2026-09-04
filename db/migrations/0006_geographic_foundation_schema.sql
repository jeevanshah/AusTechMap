-- Phase 2 geographic foundation: versioned ABS/G-NAF/Home Affairs releases,
-- region boundaries, postcode-based migration rules, and geocode results.
-- See ARCHITECTURE_DECISIONS.md sections 3.1 and 4.3 for the source policies
-- this schema implements.

CREATE TYPE geography_dataset AS ENUM (
  'asgs_sa1', 'asgs_sa2', 'asgs_sa3', 'asgs_sa4', 'asgs_gccsa', 'asgs_state',
  'asgs_lga', 'asgs_poa', 'asgs_sal',
  'gnaf',
  'home_affairs_regional', 'home_affairs_dama'
);

CREATE TYPE region_type AS ENUM ('sa1', 'sa2', 'sa3', 'sa4', 'gccsa', 'state', 'lga', 'poa', 'sal');

CREATE TYPE migration_rule_category AS ENUM ('category_2', 'category_3', 'dama');

CREATE TYPE location_match_method AS ENUM ('gnaf_exact_match', 'postcode_centroid', 'manual_override');

CREATE TYPE location_match_status AS ENUM ('accepted', 'ambiguous', 'no_match', 'out_of_bounds', 'invalid_input');

-- One row per acquired, validated release of a geographic dataset. Regions,
-- postcode rules, and geocode results all reference the release that produced
-- them; only one release per dataset may be active at a time, and activation
-- is a pointer flip, never an in-place edit of an existing release's rows.
CREATE TABLE geography_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset geography_dataset NOT NULL,
  release_version TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  import_run_id UUID REFERENCES import_runs(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  effective_to DATE,
  content_hash CHAR(64) NOT NULL,
  row_count INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset, release_version),
  CHECK (btrim(release_version) <> ''),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CHECK (row_count IS NULL OR row_count >= 0),
  CHECK (is_active = false OR activated_at IS NOT NULL)
);

-- Enforces "at most one active release per dataset" at the database level,
-- not just in application code.
CREATE UNIQUE INDEX geography_releases_one_active_per_dataset
ON geography_releases (dataset)
WHERE is_active;

CREATE TRIGGER geography_releases_set_updated_at
BEFORE UPDATE ON geography_releases
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ABS ASGS boundary polygons (and, later, other region-shaped datasets),
-- one immutable row per release. parent_region_id is populated from the
-- ABS attribute hierarchy codes at import time, not computed spatially.
CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES geography_releases(id) ON DELETE RESTRICT,
  region_type region_type NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (release_id, region_type, code),
  CHECK (btrim(code) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (ST_IsValid(geom))
);

CREATE INDEX regions_geom_gix ON regions USING GIST (geom);
CREATE INDEX regions_type_code_idx ON regions (region_type, code);
CREATE INDEX regions_release_idx ON regions (release_id);
CREATE INDEX regions_parent_idx ON regions (parent_region_id) WHERE parent_region_id IS NOT NULL;

-- Home Affairs designated-regional-area (Category 2/3) and DAMA postcode
-- rules, versioned by release the same way regions are.
CREATE TABLE postcode_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES geography_releases(id) ON DELETE RESTRICT,
  postcode TEXT NOT NULL,
  category migration_rule_category NOT NULL,
  dama_name TEXT,
  valid_from DATE NOT NULL,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (postcode ~ '^[0-9]{4}$'),
  CHECK (category <> 'dama' OR dama_name IS NOT NULL),
  CHECK (category = 'dama' OR dama_name IS NULL),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX postcode_rules_postcode_idx ON postcode_rules (postcode, category);
CREATE INDEX postcode_rules_release_idx ON postcode_rules (release_id);
CREATE UNIQUE INDEX postcode_rules_natural_key
ON postcode_rules (release_id, postcode, category, COALESCE(dama_name, ''));

-- One row per distinct geocoding input (content-hashed for idempotency and
-- caching), regardless of whether it was auto-accepted. Non-accepted rows
-- (ambiguous, no_match, out_of_bounds, invalid_input) carry no point or
-- region assignment and are the Phase 3 review queue's future input.
CREATE TABLE resolved_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_hash CHAR(64) NOT NULL UNIQUE,
  input_text TEXT NOT NULL,
  status location_match_status NOT NULL,
  method location_match_method,
  matched_gnaf_pid TEXT,
  gnaf_release_id UUID REFERENCES geography_releases(id) ON DELETE RESTRICT,
  point geometry(Point, 4326),
  sa1_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
  sa2_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
  sa3_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
  sa4_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
  lga_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
  poa_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
  migration_category migration_rule_category,
  migration_dama_name TEXT,
  candidate_count INTEGER,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(input_hash) <> ''),
  CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  CHECK (btrim(input_text) <> ''),
  CHECK (status <> 'accepted' OR (point IS NOT NULL AND method IS NOT NULL)),
  CHECK (
    status = 'accepted'
    OR (
      sa1_region_id IS NULL AND sa2_region_id IS NULL AND sa3_region_id IS NULL
      AND sa4_region_id IS NULL AND lga_region_id IS NULL AND poa_region_id IS NULL
    )
  ),
  CHECK (method <> 'gnaf_exact_match' OR (matched_gnaf_pid IS NOT NULL AND gnaf_release_id IS NOT NULL)),
  CHECK (point IS NULL OR (ST_X(point) BETWEEN 96 AND 168 AND ST_Y(point) BETWEEN -45 AND -9)),
  CHECK (candidate_count IS NULL OR candidate_count >= 0)
);

CREATE INDEX resolved_locations_point_gix ON resolved_locations USING GIST (point) WHERE point IS NOT NULL;
CREATE INDEX resolved_locations_status_idx ON resolved_locations (status);
