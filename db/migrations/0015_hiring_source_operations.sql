ALTER TABLE company_ats_sources
DROP CONSTRAINT company_ats_sources_status_check;

ALTER TABLE company_ats_sources
ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0,
ADD COLUMN last_attempted_at TIMESTAMPTZ,
ADD COLUMN last_succeeded_at TIMESTAMPTZ,
ADD COLUMN next_crawl_at TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN last_failure_at TIMESTAMPTZ,
ADD COLUMN last_failure_code TEXT,
ADD COLUMN status_reason TEXT,
ADD COLUMN status_changed_at TIMESTAMPTZ;

-- Preserve any operator state created before operational metadata existed.
UPDATE company_ats_sources
SET status_reason = 'Migrated pre-0015 source state',
    status_changed_at = now()
WHERE status <> 'active';

ALTER TABLE company_ats_sources
ADD CONSTRAINT company_ats_sources_status_check
CHECK (status IN ('active', 'paused', 'quarantined', 'disabled')),
ADD CONSTRAINT company_ats_sources_failure_count_check
CHECK (consecutive_failures >= 0),
ADD CONSTRAINT company_ats_sources_status_reason_check
CHECK (
  (status = 'active' AND status_reason IS NULL)
  OR
  (status <> 'active' AND status_reason IS NOT NULL AND btrim(status_reason) <> '')
);

CREATE INDEX company_ats_sources_due_idx
ON company_ats_sources (next_crawl_at, id)
WHERE status = 'active';
