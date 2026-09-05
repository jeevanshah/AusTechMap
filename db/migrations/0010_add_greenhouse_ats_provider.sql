-- Adds Greenhouse as a third ats_provider value, alongside lever and ashby.
-- Its real public job-board API was independently verified (Culture Amp's
-- board: boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
-- returns a real, standard {jobs: [...], meta: {...}} shape) before this
-- migration and the matching hiring/greenhouse.py adapter were written.
ALTER TYPE ats_provider ADD VALUE 'greenhouse';
