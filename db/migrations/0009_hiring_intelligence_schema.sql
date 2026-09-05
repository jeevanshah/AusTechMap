-- Phase 5 (alpha slice): jobs, observations, skills, role families, and
-- employer signals for the two ATS sources verified against real data
-- (Lever/Immutable, Ashby/Dovetail). DDL only -- role_families and skills
-- are seeded by a separate idempotent Python script (employers/seed.py's
-- established convention), not inline INSERT here.

CREATE TYPE ats_provider AS ENUM ('lever', 'ashby');

-- Not in PRODUCT_SPEC.md Appendix A (no seniority enum is frozen there) --
-- a new v1 enum. Absence of a title keyword maps to 'unknown', never a
-- guessed 'mid', per PRODUCT_SPEC.md §7.5's "never guess" rule.
CREATE TYPE job_seniority AS ENUM ('junior', 'mid', 'senior', 'staff_principal', 'management', 'unknown');

-- Direct snake_case transcription of PRODUCT_SPEC.md Appendix A.3's frozen
-- work-style enum (onsite / hybrid / remote / flexible-mixed / unknown).
CREATE TYPE work_style AS ENUM ('onsite', 'hybrid', 'remote', 'flexible_mixed', 'unknown');

CREATE TABLE role_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  parent_id UUID REFERENCES role_families(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(key) <> ''),
  CHECK (btrim(label) <> ''),
  CHECK (id IS DISTINCT FROM parent_id)
);

CREATE INDEX role_families_parent_idx ON role_families (parent_id) WHERE parent_id IS NOT NULL;

-- category is CHECK-constrained TEXT, not an ENUM: unlike role_families/
-- work_style, this taxonomy is not frozen by any spec document, so a later
-- migration can widen the CHECK list without ALTER TYPE ceremony implying
-- false permanence.
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(key) <> ''),
  CHECK (btrim(label) <> ''),
  CHECK (category IN (
    'language', 'framework', 'cloud', 'database', 'devops_tool', 'data', 'ai_ml', 'blockchain', 'other'
  ))
);

CREATE INDEX skills_active_idx ON skills (active) WHERE active;

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  source_system TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  role_family_id UUID REFERENCES role_families(id) ON DELETE RESTRICT,
  seniority job_seniority NOT NULL DEFAULT 'unknown',
  employment_type TEXT,
  remote_type work_style NOT NULL DEFAULT 'unknown',
  location_text TEXT,
  company_location_id UUID REFERENCES company_locations(id) ON DELETE RESTRICT,
  salary_min NUMERIC,
  salary_max NUMERIC,
  salary_period TEXT,
  graduate_role BOOLEAN NOT NULL DEFAULT false,
  internship_role BOOLEAN NOT NULL DEFAULT false,
  sponsorship_explicit BOOLEAN,
  source_url TEXT NOT NULL,
  description_text TEXT,
  content_hash CHAR(64) NOT NULL,
  posted_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_system, external_id),
  CHECK (btrim(title) <> ''),
  CHECK (btrim(external_id) <> ''),
  CHECK (btrim(source_url) <> ''),
  CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CHECK (last_seen_at >= first_seen_at),
  CHECK (salary_max IS NULL OR salary_min IS NULL OR salary_max >= salary_min)
);

CREATE INDEX jobs_company_idx ON jobs (company_id);
CREATE INDEX jobs_active_idx ON jobs (company_id) WHERE expired_at IS NULL;
CREATE INDEX jobs_role_family_idx ON jobs (role_family_id) WHERE role_family_id IS NOT NULL;

CREATE TRIGGER jobs_set_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only by convention/code discipline (matching raw_snapshots'
-- existing precedent), not by an enforced-immutability trigger like
-- audit_records -- a deliberate consistency choice, not an oversight.
CREATE TABLE job_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL,
  content_hash CHAR(64) NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  import_run_id UUID REFERENCES import_runs(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, observed_at),
  CHECK (content_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX job_observations_job_idx ON job_observations (job_id, observed_at DESC);

-- A re-derivable classification artifact (delete+reinsert on content
-- change), unlike job_observations' append-only historical record.
CREATE TABLE job_skill_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  method TEXT NOT NULL,
  evidence_source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, skill_id),
  CHECK (btrim(method) <> '')
);

CREATE INDEX job_skill_links_job_idx ON job_skill_links (job_id);
CREATE INDEX job_skill_links_skill_idx ON job_skill_links (skill_id);

-- Schema ships now; the derivation job that populates these is explicitly
-- deferred (see IMPLEMENTATION_PLAN.md Phase 5) -- with 2 sources and no
-- repeated-observation cadence yet, there is no real momentum to compute.
-- Documented sufficiency rule for when that job is built: sample_size >= 3
-- across >= 2 distinct observation dates >= 14 days apart.
CREATE TABLE employer_role_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_family_id UUID NOT NULL REFERENCES role_families(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  active_jobs INTEGER NOT NULL DEFAULT 0,
  new_jobs INTEGER NOT NULL DEFAULT 0,
  momentum NUMERIC,
  sample_size INTEGER NOT NULL DEFAULT 0,
  sufficient BOOLEAN NOT NULL DEFAULT false,
  methodology_version SMALLINT NOT NULL DEFAULT 1,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, role_family_id, period_start, period_end, methodology_version),
  CHECK (period_end >= period_start),
  CHECK (active_jobs >= 0 AND new_jobs >= 0 AND sample_size >= 0)
);

CREATE TABLE employer_skill_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  sufficient BOOLEAN NOT NULL DEFAULT false,
  methodology_version SMALLINT NOT NULL DEFAULT 1,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, skill_id, period_start, period_end, methodology_version),
  CHECK (evidence_count >= 0)
);

-- The ATS site/board identifier (e.g. 'immutable', 'dovetail') has no
-- reliable mechanical relationship to companies.domain, so job->company
-- resolution reads this table directly rather than re-deriving it on
-- every fetch. status/discovered_method are TEXT+CHECK, not enums, so
-- quarantine/kill-switch states can be added later by widening the CHECK,
-- not a schema redesign.
CREATE TABLE company_ats_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ats_provider ats_provider NOT NULL,
  ats_identifier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  discovered_method TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ats_provider, ats_identifier),
  UNIQUE (company_id, ats_provider),
  CHECK (btrim(ats_identifier) <> ''),
  CHECK (status IN ('active', 'paused', 'disabled'))
);

CREATE TRIGGER company_ats_sources_set_updated_at
BEFORE UPDATE ON company_ats_sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
