-- A content-addressed object may be observed by more than one import run.

ALTER TABLE raw_snapshots
DROP CONSTRAINT raw_snapshots_object_key_key;

CREATE INDEX raw_snapshots_object_key_idx
ON raw_snapshots (object_key);
