-- Phase 9: Commercial readiness — Analytics entitlements, institutional export controls,
-- and sponsored placement governance.
-- Implements PRODUCT_SPEC.md §16 & §18.7 (strict quarantine of paid placement from organic scoring)
-- and IMPLEMENTATION_PLAN.md Phase 9 (lines 295-297).

-- 1. Granular user and institutional entitlements.
CREATE TABLE user_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement TEXT NOT NULL CHECK (
    entitlement IN ('employer_analytics', 'institutional_export', 'extended_alerts', 'api_stream')
  ),
  granted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, entitlement),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX user_entitlements_user_idx ON user_entitlements (user_id);
CREATE INDEX user_entitlements_active_idx ON user_entitlements (entitlement, expires_at);

-- 2. Billing customer and subscription tier boundaries.
CREATE TABLE billing_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  billing_tier TEXT NOT NULL DEFAULT 'free' CHECK (
    billing_tier IN ('free', 'employer_pro', 'institutional_annual')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'past_due', 'canceled', 'trialing')
  ),
  current_period_end TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX billing_customers_tier_idx ON billing_customers (billing_tier, status);

-- 3. Quarantined sponsored placement ledger.
-- CRITICAL RULE (PRODUCT_SPEC.md §18.7): Payment or sponsorship records in this table
-- must NEVER alter, boost, or mutate organic Opportunity Match scores, regional labour scores,
-- or Home Affairs verification evidence.
CREATE TABLE sponsored_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  headline TEXT NOT NULL,
  target_role_families TEXT[] NOT NULL DEFAULT '{}',
  target_regions TEXT[] NOT NULL DEFAULT '{}',
  cta_label TEXT NOT NULL DEFAULT 'View Verified Profile',
  cta_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired')),
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(campaign_name) <> ''),
  CHECK (btrim(headline) <> ''),
  CHECK (end_date > start_date)
);

CREATE INDEX sponsored_placements_company_idx ON sponsored_placements (company_id);
CREATE INDEX sponsored_placements_active_idx ON sponsored_placements (status, start_date, end_date);
