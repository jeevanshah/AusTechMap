-- A registered first-party careers page is a job source alongside the
-- structured ATS providers. Reuse company_ats_sources' proven scheduling,
-- kill-switch, audit, and retry lifecycle rather than create a parallel
-- source-operations table. Its identifier is the canonical careers URL.
ALTER TYPE ats_provider ADD VALUE 'static_careers';
