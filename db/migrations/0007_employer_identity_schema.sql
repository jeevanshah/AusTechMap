-- Phase 3 employer identity: canonical company records, aliases, locations,
-- category taxonomy, evidence, and a review queue for ambiguous matches.
-- See PRODUCT_SPEC.md section 4 (data model) and IMPLEMENTATION_PLAN.md
-- Phase 3.

CREATE TYPE company_status AS ENUM ('pending_review', 'active', 'merged', 'disabled');

CREATE TYPE company_alias_type AS ENUM (
  'legal_name', 'trading_name', 'former_name', 'domain', 'abn', 'acn'
);

CREATE TYPE company_location_type AS ENUM ('head_office', 'branch', 'remote_only');

CREATE TYPE review_queue_kind AS ENUM ('candidate_match', 'duplicate_conflict', 'manual_flag');

CREATE TYPE review_queue_status AS ENUM ('pending', 'approved', 'rejected');

-- Companies are never deleted, only marked merged/disabled, so every
-- foreign key into companies (aliases, locations, evidence, review items)
-- keeps working after a merge — the merged row's merged_into_company_id
-- is the redirect, not a rewrite of every referencing row.
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  legal_name TEXT,
  display_name TEXT NOT NULL,
  abn CHAR(11),
  acn CHAR(9),
  domain TEXT,
  careers_url TEXT,
  status company_status NOT NULL DEFAULT 'pending_review',
  merged_into_company_id UUID REFERENCES companies(id) ON DELETE RESTRICT,
  disabled_reason TEXT,
  disabled_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(slug) <> ''),
  CHECK (btrim(display_name) <> ''),
  CHECK (abn IS NULL OR abn ~ '^[0-9]{11}$'),
  CHECK (acn IS NULL OR acn ~ '^[0-9]{9}$'),
  CHECK (status <> 'merged' OR merged_into_company_id IS NOT NULL),
  CHECK (status = 'merged' OR merged_into_company_id IS NULL),
  CHECK (status <> 'disabled' OR (disabled_at IS NOT NULL AND disabled_reason IS NOT NULL)),
  CHECK (id IS DISTINCT FROM merged_into_company_id)
);

-- Only one non-merged company may claim a given ABN at a time; a merged
-- company's old ABN stops blocking new registrations of that same ABN
-- under a different (post-merge) canonical record.
CREATE UNIQUE INDEX companies_abn_unique_while_not_merged
ON companies (abn)
WHERE abn IS NOT NULL AND status <> 'merged';

CREATE INDEX companies_domain_idx ON companies (domain) WHERE domain IS NOT NULL;
CREATE INDEX companies_display_name_trgm_idx ON companies USING GIN (display_name gin_trgm_ops);
CREATE INDEX companies_merged_into_idx
ON companies (merged_into_company_id)
WHERE merged_into_company_id IS NOT NULL;

CREATE TRIGGER companies_set_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE company_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_type company_alias_type NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, alias, alias_type),
  CHECK (btrim(alias) <> '')
);

CREATE INDEX company_aliases_alias_trgm_idx ON company_aliases USING GIN (alias gin_trgm_ops);
CREATE INDEX company_aliases_company_idx ON company_aliases (company_id);

CREATE TABLE company_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resolved_location_id UUID REFERENCES resolved_locations(id) ON DELETE RESTRICT,
  raw_address TEXT NOT NULL,
  location_type company_location_type NOT NULL DEFAULT 'branch',
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(raw_address) <> '')
);

CREATE INDEX company_locations_company_idx ON company_locations (company_id);
CREATE INDEX company_locations_resolved_idx
ON company_locations (resolved_location_id)
WHERE resolved_location_id IS NOT NULL;

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(key) <> ''),
  CHECK (btrim(label) <> ''),
  CHECK (id IS DISTINCT FROM parent_id)
);

CREATE INDEX categories_parent_idx ON categories (parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE company_category_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  method TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, category_id),
  CHECK (btrim(method) <> '')
);

-- Generic evidence store shared across current and future phases (identity
-- now; sponsorship, hiring signals, and regional stats in Phases 5-6),
-- mirroring audit_records' existing entity_type/entity_id polymorphic
-- pattern rather than a narrow enum that would need a migration for every
-- new claim type a later phase introduces.
CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  claim_value JSONB NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(entity_type) <> ''),
  CHECK (btrim(entity_id) <> ''),
  CHECK (btrim(claim_type) <> ''),
  CHECK (jsonb_typeof(claim_value) <> 'null')
);

CREATE INDEX evidence_entity_idx ON evidence (entity_type, entity_id, claim_type, observed_at DESC);

CREATE TABLE review_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind review_queue_kind NOT NULL,
  status review_queue_status NOT NULL DEFAULT 'pending',
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  candidate_company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  source_id UUID REFERENCES data_sources(id) ON DELETE RESTRICT,
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (
    status = 'pending'
    OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX review_queue_items_pending_idx
ON review_queue_items (created_at)
WHERE status = 'pending';

CREATE INDEX review_queue_items_company_idx
ON review_queue_items (company_id)
WHERE company_id IS NOT NULL;
