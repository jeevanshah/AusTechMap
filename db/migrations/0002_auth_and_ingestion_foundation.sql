-- Auth.js-compatible identity tables plus Phase 1 ingestion control-plane records.

CREATE TYPE app_user_role AS ENUM ('user', 'reviewer', 'admin');
CREATE TYPE account_status AS ENUM ('active', 'deletion_pending', 'disabled');
CREATE TYPE deletion_request_status AS ENUM ('pending_confirmation', 'queued', 'processing', 'completed', 'failed', 'cancelled');
CREATE TYPE source_kind AS ENUM ('government_open_data', 'employer_first_party', 'structured_feed', 'human_submission', 'derived');
CREATE TYPE source_status AS ENUM ('active', 'paused', 'disabled');
CREATE TYPE import_run_status AS ENUM ('queued', 'running', 'retry_wait', 'succeeded', 'dead_letter', 'cancelled');
CREATE TYPE import_attempt_outcome AS ENUM ('running', 'succeeded', 'retryable_failure', 'permanent_failure', 'lease_expired', 'cancelled');
CREATE TYPE audit_actor_type AS ENUM ('user', 'worker', 'system');

CREATE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(320) NOT NULL,
  "emailVerified" TIMESTAMPTZ,
  image TEXT,
  role app_user_role NOT NULL DEFAULT 'user',
  status account_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_normalized_unique ON users (lower(email));

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE accounts (
  id BIGSERIAL PRIMARY KEY,
  "userId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, "providerAccountId")
);

CREATE INDEX accounts_user_id_idx ON accounts ("userId");

CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  "userId" BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL UNIQUE,
  mfa_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions ("userId");
CREATE INDEX sessions_expires_idx ON sessions (expires);

CREATE TRIGGER sessions_set_updated_at
BEFORE UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE INDEX verification_token_expires_idx ON verification_token (expires);

CREATE TABLE staff_mfa_credentials (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret BYTEA NOT NULL,
  encryption_key_version INTEGER NOT NULL CHECK (encryption_key_version > 0),
  last_accepted_step BIGINT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER staff_mfa_credentials_set_updated_at
BEFORE UPDATE ON staff_mfa_credentials
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE staff_mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_digest BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ,
  UNIQUE (user_id, code_digest)
);

CREATE INDEX staff_mfa_recovery_codes_unused_idx
ON staff_mfa_recovery_codes (user_id)
WHERE used_at IS NULL;

CREATE TABLE account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  email_digest BYTEA NOT NULL,
  status deletion_request_status NOT NULL DEFAULT 'pending_confirmation',
  policy_version INTEGER NOT NULL CHECK (policy_version > 0),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failure_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (status <> 'failed' OR failure_code IS NOT NULL)
);

CREATE INDEX account_deletion_requests_user_idx
ON account_deletion_requests (user_id, requested_at DESC);

CREATE INDEX account_deletion_requests_pending_idx
ON account_deletion_requests (requested_at)
WHERE status IN ('queued', 'processing', 'failed');

CREATE TRIGGER account_deletion_requests_set_updated_at
BEFORE UPDATE ON account_deletion_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind source_kind NOT NULL,
  status source_status NOT NULL DEFAULT 'active',
  base_url TEXT,
  licence_name TEXT,
  licence_url TEXT,
  attribution_text TEXT,
  retrieval_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  freshness_target INTERVAL,
  disabled_reason TEXT,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(retrieval_policy) = 'object'),
  CHECK ((status <> 'disabled') OR (disabled_at IS NOT NULL AND disabled_reason IS NOT NULL))
);

CREATE TRIGGER data_sources_set_updated_at
BEFORE UPDATE ON data_sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL,
  source_id UUID REFERENCES data_sources(id) ON DELETE RESTRICT,
  replay_of_run_id UUID REFERENCES import_runs(id) ON DELETE RESTRICT,
  payload_version SMALLINT NOT NULL DEFAULT 1 CHECK (payload_version > 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority SMALLINT NOT NULL DEFAULT 100,
  idempotency_key TEXT NOT NULL,
  status import_run_status NOT NULL DEFAULT 'queued',
  scheduled_for TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  lease_owner TEXT,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  first_started_at TIMESTAMPTZ,
  last_started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by TEXT,
  terminal_error_code TEXT,
  terminal_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_type, idempotency_key),
  CHECK (btrim(run_type) <> ''),
  CHECK (btrim(idempotency_key) <> ''),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts),
  CHECK (
    (status = 'running' AND lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND heartbeat_at IS NOT NULL)
    OR
    (status <> 'running' AND lease_owner IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL AND heartbeat_at IS NULL)
  ),
  CHECK (status NOT IN ('succeeded', 'dead_letter', 'cancelled') OR finished_at IS NOT NULL),
  CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL)
);

CREATE INDEX import_runs_claim_idx
ON import_runs (priority, available_at, scheduled_for)
WHERE status IN ('queued', 'retry_wait');

CREATE INDEX import_runs_expired_lease_idx
ON import_runs (lease_expires_at)
WHERE status = 'running';

CREATE INDEX import_runs_source_history_idx
ON import_runs (source_id, created_at DESC)
WHERE source_id IS NOT NULL;

CREATE TRIGGER import_runs_set_updated_at
BEFORE UPDATE ON import_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE import_run_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES import_runs(id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  worker_id TEXT NOT NULL,
  lease_token UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  outcome import_attempt_outcome NOT NULL DEFAULT 'running',
  retry_classification TEXT,
  error_class TEXT,
  error_message TEXT,
  error_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  log_correlation_id TEXT NOT NULL,
  UNIQUE (run_id, attempt_number),
  UNIQUE (run_id, lease_token),
  CHECK (btrim(worker_id) <> ''),
  CHECK (btrim(log_correlation_id) <> ''),
  CHECK (jsonb_typeof(error_details) = 'object'),
  CHECK (jsonb_typeof(metrics) = 'object'),
  CHECK ((outcome = 'running' AND finished_at IS NULL) OR (outcome <> 'running' AND finished_at IS NOT NULL))
);

CREATE INDEX import_run_attempts_run_idx
ON import_run_attempts (run_id, attempt_number DESC);

CREATE TABLE raw_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
  import_run_id UUID NOT NULL REFERENCES import_runs(id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL UNIQUE,
  sha256 CHAR(64) NOT NULL,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  retrieved_at TIMESTAMPTZ NOT NULL,
  effective_at TIMESTAMPTZ,
  response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (btrim(object_key) <> ''),
  CHECK (jsonb_typeof(response_metadata) = 'object')
);

CREATE INDEX raw_snapshots_source_retrieved_idx
ON raw_snapshots (source_id, retrieved_at DESC);

CREATE INDEX raw_snapshots_source_checksum_idx
ON raw_snapshots (source_id, sha256);

CREATE INDEX raw_snapshots_import_run_idx
ON raw_snapshots (import_run_id);

CREATE TABLE audit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type audit_actor_type NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(action) <> ''),
  CHECK (btrim(target_type) <> ''),
  CHECK (btrim(target_id) <> ''),
  CHECK (btrim(request_id) <> ''),
  CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'),
  CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object'),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX audit_records_target_idx
ON audit_records (target_type, target_id, occurred_at DESC);

CREATE INDEX audit_records_actor_idx
ON audit_records (actor_type, actor_id, occurred_at DESC);

CREATE FUNCTION reject_audit_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_records are append-only';
END;
$$;

CREATE TRIGGER audit_records_append_only
BEFORE UPDATE OR DELETE ON audit_records
FOR EACH ROW EXECUTE FUNCTION reject_audit_record_mutation();

CREATE TRIGGER audit_records_no_truncate
BEFORE TRUNCATE ON audit_records
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_record_mutation();
