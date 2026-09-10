# Australia Tech Map — Operational Runbook & Owner's Manual

> **Phase 8 Operational Governance Standard**
> Verified: 9 September 2026
> Exit Gate Baseline: [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) §6 Phase 8:
> _"All launch gates pass and the operational owner can diagnose, disable, replay, restore, and correct the system without direct database surgery."_

---

## 1. Introduction & Operational Principles

Australia Tech Map is designed so that the operational owner and support team can maintain, inspect, and recover the system using standard administrative interfaces, automated CLI runners, and cloud-native management APIs — **without requiring direct database surgery**.

This manual details the five foundational operational actions:

1. **Diagnose**: Inspecting live health, database latency, schema version, and data anomalies.
2. **Disable**: Gracefully toggling malfunctioning sources, abusive accounts, or delisting employers.
3. **Replay**: Deterministically re-deriving change events and re-dispatching backlogged alerts.
4. **Restore**: Executing zero-downtime Point-in-Time Recovery (PITR) or verifying offline snapshots.
5. **Correct**: Processing employer profile updates, alias merges, and candidate account erasures.

---

## 2. Diagnose: System Vitals & Anomaly Detection

### A. Deep Health Diagnostics API

- **Endpoint**: `GET /api/health?deep=true`
- **Output**: JSON payload confirming service status, database roundtrip latency, and latest applied migration:
  ```json
  {
    "service": "web",
    "status": "ok",
    "version": 1,
    "diagnostics": {
      "database": "connected",
      "latencyMs": 175,
      "latestMigration": "0018_change_events_and_notification_delivery.sql"
    }
  }
  ```
- **Alert Condition**: If database connection fails, returns `503 Service Unavailable` with `status: "degraded"`.

### B. Staff Monitoring Dashboard (`/admin/monitoring`)

- **Access**: Gated by `requireStaffSession("reviewer")` and fresh TOTP MFA verification.
- **Metrics Inspected**:
  - Real-time Neon PostgreSQL ping latency (ms).
  - Applied schema migration version and timestamp.
  - Entity inventory counters: Total & Active Companies, Active Tech Roles, Derived Longitudinal Events, and Notification Deliveries.
- **Automated Data Quality Anomalies**:
  - Flags active companies with missing geographic coordinates (`company_locations` without resolved G-NAF entry).
  - Flags companies missing primary category classification.
  - Flags evidence entries older than 90 days requiring re-verification.

---

## 3. Disable: Source Disabling & Entity Kill-Switches

### A. Disabling a Malfunctioning Careers Source

If an employer's ATS endpoint undergoes format drift or returns invalid postings:

1. Navigate to `/admin/companies/[id]` in the staff dashboard.
2. Toggle the ATS source to **Inactive** (`is_active = false`).
3. _Effect_: The ingestion crawler skips this source on subsequent runs. All historical jobs and observations remain preserved for audit integrity.

### B. Delisting or Archiving an Employer

If a company shuts down or requests delisting:

1. Open the employer profile in `/admin/companies/[id]`.
2. Update company status to `archived`.
3. _Effect_: The company is instantly excluded from public search results, map bounding boxes, and Opportunity Match rankings.

### C. Pausing Notification Email Digests

To halt outgoing email digests without shutting down web traffic:

- Set environment variable `RESEND_API_KEY=""` or run the retention runner in dry-run mode:
  ```bash
  node --env-file=.env apps/web/scripts/run-retention-pipeline.mjs --dry-run
  ```

---

## 4. Replay: Event Derivation & Notification Delivery

### A. Replaying Longitudinal Change Events

To re-derive change events (`job.first_seen`, `sponsorship.evidence_added`, `company.location_added`) across all active employers:

```bash
node --env-file=.env apps/web/scripts/run-retention-pipeline.mjs
```

- **Idempotency Guarantee**: Events employ deterministic deduplication keys (`dedupe_key = SHA-256(event_type + entity_id + date)`). Replaying derivation multiple times produces **0 duplicate events**.

### B. Backlog Recovery for Failed Notifications

If an external mail gateway outage occurs (e.g. Resend HTTP 500 or timeout):

1. The pipeline automatically catches the error and avoids recording delivery in `notification_deliveries`.
2. Once the mail provider is restored, simply re-run the retention script:
   ```bash
   node --env-file=.env apps/web/scripts/run-retention-pipeline.mjs --frequency=daily
   ```
3. All backlogged events are dispatched. Successfully delivered users are recorded with `ON CONFLICT DO NOTHING`, guaranteeing that no user receives duplicate alerts.

---

## 5. Restore: Point-in-Time Recovery & Backup Verification

### A. Point-in-Time Recovery (PITR) via Neon Branching

If accidental data corruption occurs:

1. Locate the exact timestamp or LSN prior to the incident in `audit_records`.
2. Create an emergency recovery branch in the Neon console or CLI:
   ```bash
   neon branches create \
     --name recovery-$(date +%Y%m%d) \
     --parent main \
     --timestamp "2026-09-08T22:00:00Z"
   ```
3. Verify the recovered branch using the automated backup drill:
   ```bash
   DATABASE_URL="<recovery_branch_url>" node apps/web/scripts/run-backup-drill.mjs
   ```
4. Update `DATABASE_URL` in Vercel. **Recovery Time Objective (RTO): < 60 seconds.**

### B. Offline Logical Snapshot Export

To produce an encrypted, portable cold-storage backup:

```bash
node --env-file=.env apps/web/scripts/run-backup-drill.mjs
```

- Exports all 26 application tables to `backups/snapshot_<timestamp>/`.
- Generates `manifest.json` with cryptographic SHA-256 integrity checksums.
- Verifies foreign-key integrity (0 orphan records).

---

## 6. Correct: Dispute Processing & User Account Erasure

### A. Reviewing Employer Corrections & Claims

When an employer submits an update via [`/corrections`](file:///c:/Users/jeeva/Projects/AusTechMap/apps/web/src/app/corrections/page.tsx):

1. The submission creates a pending item in `review_queue_items`.
2. Staff reviewers open `/admin/review`.
3. Reviewers inspect proposed domain, ABN, location, or sponsorship evidence.
4. Clicking **Approve** updates the entity atomically and records an audit log entry in `audit_records`.

### B. Candidate Account Deletion (APP 11 Erasure)

When a user requests account deletion via `/account/delete`:

1. The user confirms deletion with a fresh session challenge.
2. The application executes [`erasure.ts`](file:///c:/Users/jeeva/Projects/AusTechMap/apps/web/src/lib/deletion/erasure.ts):
   - Atomically deletes credentials, sessions, saved searches, watchlists, and user alerts.
   - Cleans up personal identifiers while writing an age-encrypted, anonymized receipt to `account_deletion_requests`.
   - **Zero manual database intervention is required**.

---

## 7. Operational Escalation Contacts & Matrix

| Incident Type                           | Initial Action      | Tool / Dashboard              | Escalation Target   |
| :-------------------------------------- | :------------------ | :---------------------------- | :------------------ |
| **API Latency Spike (> 250ms)**         | Check DB roundtrip  | `/api/health?deep=true`       | Infrastructure Lead |
| **Data Quality Drift / Stale Evidence** | Run anomaly check   | `/admin/monitoring`           | Data Operations     |
| **Mail Gateway Failure**                | Verify mail queue   | `failureRecovery.test.ts`     | Backend Lead        |
| **Security Incident / Abuse**           | Review audit ledger | `SELECT * FROM audit_records` | Security Officer    |
