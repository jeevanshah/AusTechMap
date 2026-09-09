-- Adds SmartRecruiters and Workable as additional ats_provider values,
-- alongside lever, ashby, and greenhouse.
-- SmartRecruiters verified against Canva's live public board (api.smartrecruiters.com/v1/companies/canva/postings).
-- Workable verified against Rokt's live public board (apply.workable.com/api/v1/widget/accounts/rokt).
ALTER TYPE ats_provider ADD VALUE 'smartrecruiters';
ALTER TYPE ats_provider ADD VALUE 'workable';
