export const EVIDENCE_STATUSES = [
  "active",
  "stale",
  "superseded",
  "rejected",
  "needs_review",
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export function isEvidenceStatus(value: string): value is EvidenceStatus {
  return EVIDENCE_STATUSES.some((status) => status === value);
}
