-- Phase 7: Saved searches, company/region watchlists, and in-app retention alerts.
-- Enables authenticated discovery retention: discover -> save -> monitor -> alert -> return.
-- User-owned saved state is purged on account deletion via the erasure-hook registry.

CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  alert_frequency TEXT NOT NULL DEFAULT 'never',
  last_alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(name) <> ''),
  CHECK (alert_frequency IN ('never', 'daily', 'weekly', 'instant')),
  CHECK (jsonb_typeof(filters) = 'object')
);

CREATE INDEX saved_searches_user_id_idx ON saved_searches (user_id);
CREATE INDEX saved_searches_alert_freq_idx ON saved_searches (alert_frequency) WHERE alert_frequency <> 'never';

CREATE TRIGGER saved_searches_set_updated_at
BEFORE UPDATE ON saved_searches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  region_id UUID REFERENCES regions(id) ON DELETE CASCADE,
  sa4_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (entity_type IN ('company', 'region')),
  CHECK (
    (entity_type = 'company' AND company_id IS NOT NULL AND region_id IS NULL AND sa4_code IS NULL) OR
    (entity_type = 'region' AND company_id IS NULL AND (region_id IS NOT NULL OR sa4_code IS NOT NULL))
  )
);

CREATE INDEX watchlists_user_id_idx ON watchlists (user_id);
CREATE UNIQUE INDEX watchlists_user_company_uniq ON watchlists (user_id, company_id) WHERE entity_type = 'company';
CREATE UNIQUE INDEX watchlists_user_region_code_uniq ON watchlists (user_id, sa4_code) WHERE entity_type = 'region' AND sa4_code IS NOT NULL;
CREATE UNIQUE INDEX watchlists_user_region_id_uniq ON watchlists (user_id, region_id) WHERE entity_type = 'region' AND region_id IS NOT NULL;

CREATE TRIGGER watchlists_set_updated_at
BEFORE UPDATE ON watchlists
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  entity_type TEXT,
  entity_id TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (alert_type IN ('new_job', 'sponsorship_change', 'company_update', 'region_update', 'saved_search_match')),
  CHECK (btrim(title) <> ''),
  CHECK (btrim(message) <> '')
);

CREATE INDEX user_alerts_user_created_idx ON user_alerts (user_id, created_at DESC);
CREATE INDEX user_alerts_user_unread_idx ON user_alerts (user_id, read_at) WHERE read_at IS NULL;
