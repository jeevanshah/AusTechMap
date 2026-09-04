-- The operational retry contract permits at most six total attempts.

ALTER TABLE import_runs
ADD CONSTRAINT import_runs_max_attempts_contract
CHECK (max_attempts BETWEEN 1 AND 6);
