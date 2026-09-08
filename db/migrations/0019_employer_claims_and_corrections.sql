-- Phase 9: Commercial readiness — Verified employer claims and community data corrections.
-- Implements PRODUCT_SPEC.md §3.2 Rule 11 (strict separation of claimed vs observed facts)
-- and §11 (admin and human review workflows).

ALTER TYPE review_queue_kind ADD VALUE IF NOT EXISTS 'employer_claim';
ALTER TYPE review_queue_kind ADD VALUE IF NOT EXISTS 'data_correction';

CREATE TYPE employer_claim_status AS ENUM ('pending', 'approved', 'rejected', 'revoked');

CREATE TYPE data_correction_type AS ENUM (
  'location_incorrect',
  'careers_url_broken',
  'sponsorship_dispute',
  'category_mismatch',
  'other'
);

CREATE TYPE data_correction_status AS ENUM ('pending', 'approved', 'rejected');

-- Add claimed status to companies without altering or overwriting raw observations.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS companies_is_claimed_idx ON companies (is_claimed) WHERE is_claimed = true;

-- Dedicated ledger for verified employer claims.
CREATE TABLE employer_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  claimant_name TEXT NOT NULL,
  claimant_email TEXT NOT NULL,
  claimant_role TEXT NOT NULL,
  claim_type TEXT NOT NULL DEFAULT 'profile_verification',
  claimed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_url TEXT,
  status employer_claim_status NOT NULL DEFAULT 'pending',
  review_notes TEXT,
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(claimant_name) <> ''),
  CHECK (btrim(claimant_email) <> ''),
  CHECK (btrim(claimant_role) <> ''),
  CHECK (jsonb_typeof(claimed_data) = 'object'),
  CHECK (
    status = 'pending'
    OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX employer_claims_company_idx ON employer_claims (company_id);
CREATE INDEX employer_claims_status_idx ON employer_claims (status, created_at DESC);
CREATE INDEX employer_claims_user_idx ON employer_claims (user_id);

-- Dedicated ledger for community data disputes and corrections.
CREATE TABLE data_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  submitter_name TEXT,
  submitter_email TEXT NOT NULL,
  correction_type data_correction_type NOT NULL,
  details TEXT NOT NULL,
  evidence_url TEXT,
  status data_correction_status NOT NULL DEFAULT 'pending',
  review_notes TEXT,
  reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(submitter_email) <> ''),
  CHECK (btrim(details) <> ''),
  CHECK (
    status = 'pending'
    OR (reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX data_corrections_company_idx ON data_corrections (company_id);
CREATE INDEX data_corrections_status_idx ON data_corrections (status, created_at DESC);
