-- Successful ATS crawl counts are append-only operational evidence. They make
-- a sudden board collapse visible without treating a normal small-board change
-- as an incident.
CREATE TABLE ats_source_crawl_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_ats_source_id UUID NOT NULL REFERENCES company_ats_sources(id) ON DELETE RESTRICT,
  import_run_id UUID NOT NULL REFERENCES import_runs(id) ON DELETE RESTRICT,
  observed_at TIMESTAMPTZ NOT NULL,
  reported_job_count INTEGER NOT NULL CHECK (reported_job_count >= 0),
  baseline_job_count NUMERIC(12, 2),
  baseline_sample_size SMALLINT NOT NULL CHECK (baseline_sample_size BETWEEN 0 AND 3),
  baseline_method TEXT NOT NULL,
  is_job_count_anomaly BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(baseline_method) <> ''),
  CHECK (
    (baseline_sample_size = 0 AND baseline_job_count IS NULL)
    OR (baseline_sample_size > 0 AND baseline_job_count IS NOT NULL AND baseline_job_count >= 0)
  ),
  UNIQUE (import_run_id)
);

CREATE INDEX ats_source_crawl_metrics_source_observed_idx
ON ats_source_crawl_metrics (company_ats_source_id, observed_at DESC, id DESC);

CREATE INDEX ats_source_crawl_metrics_anomaly_idx
ON ats_source_crawl_metrics (observed_at DESC, company_ats_source_id)
WHERE is_job_count_anomaly;

CREATE FUNCTION reject_ats_source_crawl_metric_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ats_source_crawl_metrics is append-only';
END;
$$;

CREATE TRIGGER ats_source_crawl_metrics_no_update_delete
BEFORE UPDATE OR DELETE ON ats_source_crawl_metrics
FOR EACH ROW EXECUTE FUNCTION reject_ats_source_crawl_metric_mutation();

CREATE TRIGGER ats_source_crawl_metrics_no_truncate
BEFORE TRUNCATE ON ats_source_crawl_metrics
FOR EACH STATEMENT EXECUTE FUNCTION reject_ats_source_crawl_metric_mutation();
