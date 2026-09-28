-- Applicant Velocity P2: private job vault and application tracker.
--
-- A snapshot is captured from the verified jobs registry at the moment a user
-- explicitly saves a role. It is intentionally immutable so an expired or
-- subsequently edited ATS listing cannot erase the version used to apply.

CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'saved',
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL,
  notes TEXT,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  interviewing_at TIMESTAMPTZ,
  offer_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id),
  CHECK (status IN ('saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn')),
  CHECK (snapshot_version = 1),
  CHECK (jsonb_typeof(snapshot) = 'object'),
  CHECK (btrim(snapshot->>'jobTitle') <> ''),
  CHECK (btrim(snapshot->>'companyName') <> ''),
  CHECK (btrim(snapshot->>'sourceUrl') <> ''),
  CHECK (notes IS NULL OR char_length(notes) <= 5000)
);

CREATE INDEX job_applications_user_saved_idx
  ON job_applications (user_id, saved_at DESC);
CREATE INDEX job_applications_user_status_idx
  ON job_applications (user_id, status, status_changed_at DESC);

CREATE TRIGGER job_applications_set_updated_at
BEFORE UPDATE ON job_applications
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION protect_job_application_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.snapshot_version IS DISTINCT FROM OLD.snapshot_version
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.saved_at IS DISTINCT FROM OLD.saved_at THEN
    RAISE EXCEPTION 'job application snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_applications_protect_snapshot
BEFORE UPDATE ON job_applications
FOR EACH ROW EXECUTE FUNCTION protect_job_application_snapshot();
