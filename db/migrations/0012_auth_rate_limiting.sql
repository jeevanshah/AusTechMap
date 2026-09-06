-- Atomic rate-limit counters for magic-link requests and MFA attempts
-- (ARCHITECTURE_DECISIONS.md §4.1). Mirrors import_runs' existing atomic
-- claim pattern: a single INSERT ... ON CONFLICT ... DO UPDATE round trip,
-- never a read-then-write race.
CREATE TABLE auth_rate_limit_buckets (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  locked_until TIMESTAMPTZ,
  PRIMARY KEY (scope, key, window_start),
  CHECK (btrim(scope) <> ''),
  CHECK (btrim(key) <> ''),
  CHECK (attempt_count > 0)
);

CREATE INDEX auth_rate_limit_buckets_cleanup_idx ON auth_rate_limit_buckets (window_start);
