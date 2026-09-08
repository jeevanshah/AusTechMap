-- Phase 6B regional-intelligence foundation. JSA observations and derived
-- opportunity scores are immutable, versioned facts. A later importer may
-- append corrected source releases or methodology versions, but must never
-- rewrite an already-published result.

CREATE TYPE regional_labor_dataset AS ENUM ('nero', 'ivi');

CREATE TABLE regional_labor_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  role_family_id UUID REFERENCES role_families(id) ON DELETE RESTRICT,
  dataset regional_labor_dataset NOT NULL,
  metric_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  direction SMALLINT,
  source_version TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  import_run_id UUID REFERENCES import_runs(id) ON DELETE RESTRICT,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(metric_key) <> ''),
  CHECK (period_end >= period_start),
  CHECK (btrim(unit) <> ''),
  CHECK (direction IS NULL OR direction BETWEEN -1 AND 1),
  CHECK (btrim(source_version) <> '')
);

CREATE UNIQUE INDEX regional_labor_observations_natural_key
ON regional_labor_observations (
  region_id,
  role_family_id,
  dataset,
  metric_key,
  period_start,
  period_end,
  source_version
) NULLS NOT DISTINCT;

CREATE INDEX regional_labor_observations_lookup_idx
ON regional_labor_observations (region_id, role_family_id, dataset, period_end DESC);

CREATE TABLE region_opportunity_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  role_family_id UUID REFERENCES role_families(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  score NUMERIC(5, 2),
  components_json JSONB NOT NULL,
  methodology_version TEXT NOT NULL,
  sufficiency_json JSONB NOT NULL,
  input_fingerprint CHAR(64) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  CHECK (jsonb_typeof(components_json) = 'object'),
  CHECK (jsonb_typeof(sufficiency_json) = 'object'),
  CHECK (
    sufficiency_json ? 'sufficient'
    AND jsonb_typeof(sufficiency_json -> 'sufficient') = 'boolean'
  ),
  CHECK (btrim(methodology_version) <> ''),
  CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK ((sufficiency_json ->> 'sufficient')::boolean = (score IS NOT NULL))
);

CREATE UNIQUE INDEX region_opportunity_scores_idempotency_key
ON region_opportunity_scores (
  region_id,
  role_family_id,
  period_start,
  period_end,
  methodology_version,
  input_fingerprint
) NULLS NOT DISTINCT;

CREATE INDEX region_opportunity_scores_public_lookup_idx
ON region_opportunity_scores (region_id, role_family_id, generated_at DESC);

CREATE FUNCTION reject_regional_intelligence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER regional_labor_observations_no_update_delete
BEFORE UPDATE OR DELETE ON regional_labor_observations
FOR EACH ROW EXECUTE FUNCTION reject_regional_intelligence_mutation();

CREATE TRIGGER regional_labor_observations_no_truncate
BEFORE TRUNCATE ON regional_labor_observations
FOR EACH STATEMENT EXECUTE FUNCTION reject_regional_intelligence_mutation();

CREATE TRIGGER region_opportunity_scores_no_update_delete
BEFORE UPDATE OR DELETE ON region_opportunity_scores
FOR EACH ROW EXECUTE FUNCTION reject_regional_intelligence_mutation();

CREATE TRIGGER region_opportunity_scores_no_truncate
BEFORE TRUNCATE ON region_opportunity_scores
FOR EACH STATEMENT EXECUTE FUNCTION reject_regional_intelligence_mutation();
