# Australia Tech Map — System Threat Model & Security Architecture

> **Security Architecture & STRIDE Threat Analysis**
> Version 1.0 · 9 September 2026
> Specification Baselines: [PRODUCT_SPEC.md](../../PRODUCT_SPEC.md) §12; [ARCHITECTURE_DECISIONS.md](../../ARCHITECTURE_DECISIONS.md) §4.1; [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) §6 Phase 8.

---

## 1. System Overview & Trust Boundaries

Australia Tech Map processes sensitive workforce intelligence, geographic locations, employer careers data, and user job-search preferences. The platform operates across four primary trust zones:

```
[ Public Internet ]
       │
       ▼ (HTTPS / Strict CSP / Rate Limits)
[ Vercel Edge & Web Application Layer (Next.js 16) ]
       │ (Signed JWT / Fresh MFA / Parameterized SQL)
       ├───► [ Neon PostgreSQL 18.6 + PostGIS (Sydney AWS) ]
       │
       ▼ (Egress SSRF Guard / User-Agent AusTechMapBot)
[ External Services: ATS APIs, Resend Mail, MapTiler ]
```

### Trust Zones:

1. **Public Zone (Untrusted)**: Anonymous web visitors, mobile browsers, and search crawlers.
2. **Authenticated User Zone (Semi-Trusted)**: Signed-in job seekers and career explorers holding magic-link session cookies.
3. **Staff / Administrative Zone (Privileged)**: Reviewers and administrators holding verified TOTP Multi-Factor Authentication credentials.
4. **Data Plane & Ingestion (Internal)**: Neon PostgreSQL serverless database and scheduled worker pipelines.

---

## 2. STRIDE Threat Analysis

### A. Spoofing Identity

| Threat Scenario                       | Risk Level | Implemented Mitigation                                                                                                                                                      | Verification                             |
| :------------------------------------ | :--------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------- |
| **Candidate Session Hijacking**       |   Medium   | Passwordless magic-link authentication (`next-auth@5.0.0-beta.32`) with signed, HTTP-only, secure session cookies.                                                          | Verified via NextAuth CSRF protection    |
| **Staff Admin Impersonation**         |  Critical  | Mandatory Time-based One-Time Password (TOTP MFA) via `otpauth`. Secrets encrypted with AES-256 (`MFA_ENCRYPTION_KEY_V1`). `requireFreshMfa` gates mutating server actions. | Verified in `mfa/verify` unit test suite |
| **Client IP Spoofing on Rate Limits** |    Low     | Deterministic IP resolution prioritizing trusted proxy headers (`cf-connecting-ip`, `x-forwarded-for`) with strict loopback/private IP fallback.                            | 8 passing tests in `request-ip.test.ts`  |

### B. Tampering with Data

| Threat Scenario                  | Risk Level | Implemented Mitigation                                                                                                                         | Verification                                             |
| :------------------------------- | :--------: | :--------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------- |
| **SQL Injection Attacks**        |  Critical  | 100% of database queries employ parameterized prepared statements via the `pg` client library. Zero raw SQL string interpolation.              | Codebase lint and test suites                            |
| **Ingestion Pipeline Pollution** |    High    | Raw crawled snapshots are immutable, hashed with SHA-256 (`payload_hash`), and stored separately from derived entity tables.                   | Verified in migration `0002` and Python ingestion models |
| **Tampering with Staff Reviews** |    High    | All review queue approvals, company alias merges, and category updates are wrapped in PostgreSQL transactions and recorded in `audit_records`. | Verified in `admin/companies/actions.test.ts`            |

### C. Repudiation

| Threat Scenario                                  | Risk Level | Implemented Mitigation                                                                                                                                    | Verification                          |
| :----------------------------------------------- | :--------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------ |
| **Unattributed Administrative Actions**          |    High    | Every mutating server action invokes `recordAudit` capturing `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `changes`, and `ip_address`. | 2 passing tests in `audit.test.ts`    |
| **Notification Dispute (False Delivery Claims)** |   Medium   | `notification_deliveries` maintains an append-only ledger recording `(user_id, event_id, channel, delivery_window, status, delivered_at)`.                | Unique constraint in migration `0018` |

### D. Information Disclosure

| Threat Scenario                          | Risk Level | Implemented Mitigation                                                                                                                                                    | Verification                              |
| :--------------------------------------- | :--------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------- |
| **Server-Side Request Forgery (SSRF)**   |  Critical  | Egress URL validator (`ssrf.ts`) checks pre-flight DNS resolution and rejects all IPv4/IPv6 private ranges, loopbacks, multicast, and cloud metadata (`169.254.169.254`). | 8 unit tests in `ssrf.test.ts`            |
| **Cross-Site Scripting (XSS)**           |    High    | Strict Content-Security-Policy (CSP) restricting `script-src`, `style-src`, `connect-src`, and blocking `object-src 'none'`. React 19 automatic output escaping.          | Production headers verified via `curl -i` |
| **Clickjacking / UI Redressing**         |   Medium   | `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` prevent embedding Australia Tech Map in foreign frames.                                                          | Live response header inspection           |
| **PII Lingering After Account Deletion** |    High    | APP 11 compliant automated deletion deletes all user records, saved searches, and alerts atomically. Anonymized receipt encrypted via Age public key.                     | 4 unit tests in `erasure.test.ts`         |

### E. Denial of Service (DoS)

| Threat Scenario                          | Risk Level | Implemented Mitigation                                                                                                                                               | Verification                            |
| :--------------------------------------- | :--------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------- |
| **Volumetric API Flooding**              |    High    | Postgres-backed rate limiting on abuse-prone endpoints: `/api/opportunities/match` (20 req/min), `/api/export/*` (10 req/min), `/api/search/companies` (60 req/min). | 9 passing tests in `rate-limit.test.ts` |
| **Unbounded Spatial Geospatial Queries** |   Medium   | Bounding box queries (`/api/map/companies`) enforce hard coordinate limits, clamping maximum longitude/latitude spans to prevent memory exhaustion.                  | 16 unit tests in `bbox.test.ts`         |
| **Transient Rate Limiter DB Failure**    |   Medium   | Fail-open safety (`enforceApiRateLimit` try/catch) ensures legitimate user traffic is not blocked if rate limiting table encounters transient latency.               | Automated fail-open test cases          |

### F. Elevation of Privilege

| Threat Scenario                         | Risk Level | Implemented Mitigation                                                                                                                                                   | Verification                     |
| :-------------------------------------- | :--------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------- |
| **Horizontal Tenant Access**            |    High    | User-owned saved searches and watchlists strictly query `WHERE user_id = actor.id`. Users cannot view or mutate another user's retention state.                          | Verified in `retention.test.ts`  |
| **Vertical Staff Privilege Escalation** |  Critical  | Role-ranked authorization hierarchy (`user < reviewer < admin`). Reviewers can inspect and approve moderation queue items; only `admin` can mutate system configuration. | 3 tests in `page-access.test.ts` |

---

## 3. Secret Management & Key Rotation Policy

| Secret Name             | Purpose                    | Location                    | Rotation Procedure                                                 |
| :---------------------- | :------------------------- | :-------------------------- | :----------------------------------------------------------------- |
| `DATABASE_URL`          | Neon PostgreSQL Connection | Vercel Environment / `.env` | Generate new Neon compute role, update Vercel, terminate old role  |
| `AUTH_SECRET`           | NextAuth Session Signing   | Vercel Sensitive Variable   | Rotate in Vercel; invalidates active sessions gracefully           |
| `MFA_ENCRYPTION_KEY_V1` | TOTP Seed Encryption       | Vercel Sensitive Variable   | Versioned key ring (`v1`, `v2`); supports seamless re-encryption   |
| `AUTH_RESEND_KEY`       | Resend Mail API Key        | Vercel Sensitive Variable   | Issue new token in Resend dashboard, update Vercel, revoke old key |

---

## 4. Operational Sign-Off & Verification

- **STRIDE Threat Modeling Status**: **COMPLETE & APPROVED**
- **Security Headers Active**: Strict CSP, HSTS, X-Frame-Options: DENY, nosniff, Permissions-Policy
- **Automated Security Tests**: 8 SSRF tests, 9 rate-limit tests, 8 TOTP MFA tests, 4 account deletion tests (29 security-focused unit tests passing)
