-- Pinpoint's public postings.json is an employer first-party ATS feed.  It
-- uses the existing company_ats_sources scheduling, audit, and kill-switch
-- lifecycle rather than introducing a provider-specific source table.
ALTER TYPE ats_provider ADD VALUE 'pinpoint';
