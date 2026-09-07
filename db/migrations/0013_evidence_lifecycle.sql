CREATE TYPE evidence_status AS ENUM (
  'active',
  'stale',
  'superseded',
  'rejected',
  'needs_review'
);

ALTER TABLE evidence
ADD COLUMN status evidence_status NOT NULL DEFAULT 'active';

CREATE INDEX evidence_public_claim_idx
ON evidence (entity_type, entity_id, claim_type, observed_at DESC)
WHERE status = 'active';
