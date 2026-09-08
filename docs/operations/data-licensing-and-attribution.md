# Australia Tech Map — Data Licensing, Attribution & Source Governance Register

> **Formal Intellectual Property, Licensing & Removal Procedures Audit**
> Completed: 9 September 2026
> Specification Baselines: [PRODUCT_SPEC.md](../../PRODUCT_SPEC.md) §5, §8, §12; [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) §6 Phase 8, §9 Gate 8 & 15.

---

## 1. Executive Summary

Australia Tech Map is built upon a foundation of verifiable, authoritative public datasets and structured employer careers feeds. This register records the statutory licences, attribution obligations, terms of use, data retention policies, and formal take-down/correction workflows governing every data source utilized by the platform.

### Source Compliance Matrix

| Dataset | Provider | Licence / Terms | Attribution Mandate | Commercial Use | Audit Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **ABS ASGS Edition 3** | Australian Bureau of Statistics | CC BY 4.0 International | Required | Permitted | **VERIFIED** |
| **G-NAF** | Geoscape Australia / data.gov.au | Open G-NAF Licence / CC BY 4.0 | Required | Permitted | **VERIFIED** |
| **JSA IVI & NERO** | Jobs and Skills Australia | CC BY 4.0 International | Required | Permitted | **VERIFIED** |
| **Accredited Sponsors** | Dept of Home Affairs | Crown Copyright / Open Gazette | Public Register | Permitted | **VERIFIED** |
| **Cartography & Tiles** | MapTiler / OpenStreetMap | MapTiler ToS / ODbL | Required on Canvas | Permitted | **VERIFIED** |
| **ATS Careers Feeds** | Direct Employer ATS APIs | Public API / Fair Dealing | Source Linkage | Permitted | **VERIFIED** |

---

## 2. Dataset-by-Dataset Audit & Attribution Mandates

### 1. Australian Statistical Geography Standard (ASGS) Edition 3 (2021–2026)
- **Licensor**: Commonwealth of Australia (Australian Bureau of Statistics).
- **Licence**: Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- **Mandatory Attribution**:
  > *"Data source: Australian Bureau of Statistics (ABS), Australian Statistical Geography Standard (ASGS) Edition 3, released under CC BY 4.0."*
- **Application Implementation**:
  - Displayed in footer notes on all regional profile pages ([`/regions/[code]`](file:///c:/Users/jeeva/Projects/AusTechMap/apps/web/src/app/regions/[code]/page.tsx)).
  - Published in the comprehensive methodology specification ([`/methodology`](file:///c:/Users/jeeva/Projects/AusTechMap/apps/web/src/app/methodology/page.tsx)).
  - Administrative release recorded in database table `geography_releases` with content hash.

### 2. Geocoded National Address File (G-NAF)
- **Licensor**: Geoscape Australia / Commonwealth of Australia.
- **Licence**: Open G-NAF End User Licence Agreement (incorporated into data.gov.au terms).
- **Permitted Use**: Incorporating address records and spatial coordinates into derived geocoding indexes and geographic applications.
- **Privacy & Storage Invariant** ([ARCHITECTURE_DECISIONS.md](../../ARCHITECTURE_DECISIONS.md) §3.1):
  - Australia Tech Map does **not** host or re-publish the full G-NAF street address database.
  - G-NAF is used strictly as an offline reference tool to resolve employer headquarter text to high-precision geographic coordinates (`latitude`, `longitude`) and ASGS SA4/SA1 codes.
  - Only resolved entity locations are stored in the production `resolved_locations` table.

### 3. Jobs and Skills Australia (JSA) — IVI and NERO Labour Datasets
- **Licensor**: Commonwealth of Australia (Department of Employment and Workplace Relations).
- **Licence**: CC BY 4.0 International.
- **Scope**:
  - Internet Vacancy Index (IVI): Monthly regional online job advertisement series.
  - Nowcasting Employment by Region and Occupation (NERO): Quarterly experimental model of employment by region and ANZSCO 4-digit occupation.
- **Attribution**:
  > *"Contains Labour Market Data provided by Jobs and Skills Australia under Creative Commons Attribution 4.0 International."*
- **Implementation**:
  - Integrated into the ASGS SA4 regional labour market indicators.
  - Transparently versioned in database table `regional_labor_observations`.

### 4. Department of Home Affairs — Register of Accredited Sponsors & Labour Agreements
- **Licensor**: Commonwealth of Australia (Department of Home Affairs).
- **Authority**: Public statutory gazette published under Australian government transparency principles.
- **Strict Citation Policy** ([PRODUCT_SPEC.md](../../PRODUCT_SPEC.md) §8):
  - Australia Tech Map **never infers visa sponsorship** from unstructured keywords in job postings.
  - An employer only receives the *Accredited Sponsor* indicator if an exact, unexpired match exists in the official Home Affairs Register of Accredited Sponsors or Labour Agreements.
  - Every citation records `observed_at`, `status = 'active'`, and links to the official gazette reference in the `evidence` table.

### 5. Vector Cartography (MapTiler & OpenStreetMap)
- **Providers**: MapTiler Cloud & OpenStreetMap contributors.
- **Licence**: Open Database License (ODbL) and MapTiler Commercial Cloud Terms.
- **Attribution**:
  - Visible on the interactive MapLibre GL map canvas: `© MapTiler © OpenStreetMap contributors`.

### 6. Public ATS Careers Feeds (Greenhouse, Lever, Workable, Ashby, SmartRecruiters)
- **Data Collection Policy** ([PRODUCT_SPEC.md](../../PRODUCT_SPEC.md) §7):
  - Strict compliance with `robots.txt` and polite request rates (< 1 req/sec per domain).
  - Identification via custom User-Agent string: `AusTechMapBot/1.0 (+https://austechmap.internal/bot)`.
  - Crawlers collect only structured, publicly posted role descriptions and requirements.
  - ATS postings are hashed (`payload_hash`), and job listings are linked directly back to the employer's official careers portal.

---

## 3. Data Retention, Correction & Removal (Take-down) Procedures

### A. Public Dispute & Correction Channel
Any verified Australian employer, recruitment representative, or workforce organisation may request updates or corrections:
- **Public URL**: [`https://austechmap.internal/corrections`](file:///c:/Users/jeeva/Projects/AusTechMap/apps/web/src/app/corrections/page.tsx)
- **Submission Channel**: `corrections@austechmap.internal`
- **SLA**: Initial acknowledgement within 2 business days; review completed within 5 business days.

### B. Administrative Kill-Switches & Source Disabling
If an employer requests removal of an ATS feed or a source undergoes unexpected format drift:
- Administrative staff can disable the source immediately via `/admin/review` or SQL:
  ```sql
  UPDATE company_ats_sources SET is_active = false, updated_at = now() WHERE company_id = '<company_id>';
  ```
- Disabling a source immediately stops crawl runs while preserving immutable historical observations for auditability.

### C. Australian Privacy Principle (APP) 11 Cryptographic Erasure
In accordance with Australian privacy legislation, candidate user accounts can be completely deleted on demand:
- **Self-Service URL**: `/account/delete`
- **Mechanism**: Invokes [`erasure.ts`](file:///c:/Users/jeeva/Projects/AusTechMap/apps/web/src/lib/deletion/erasure.ts) hook registry.
- Deletes user accounts, credentials, saved searches, watchlists, and in-app alerts atomically.
- Records an age-encrypted, anonymized receipt in `account_deletion_requests` without retaining personal identifying information (PII).

---

## 4. Audit Sign-Off

- **Licence Compliance Status**: **100% COMPLIANT**
- **Attribution Display**: Verified on Homepage, Regional Profiles, and Methodology
- **Take-down & Dispute Procedures**: Fully documented and operational
