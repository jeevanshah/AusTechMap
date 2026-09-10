# Australia Tech Map — Controlled Beta Launch Protocol

> **Phase 8 Beta Operating Standard & Defect Triage Framework**
> Prepared: 9 September 2026
> Specification Baselines: [PRODUCT_SPEC.md](../../PRODUCT_SPEC.md) §13, §15; [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) §6 Phase 8.

---

## 1. Beta Objectives & Cohort Structure

The controlled beta period validates real-world discovery utility, opportunity matching accuracy, and user retention before broad public marketing:

### Target Beta Audiences:

1. **Australian Tech Job Seekers**: Software engineers, data specialists, and product leaders actively exploring the market.
2. **Skilled Visa Candidates**: International technologists seeking verified Department of Home Affairs accredited sponsors.
3. **Regional Movers**: Technologists evaluating tech hubs outside Sydney/Melbourne (e.g. Brisbane, Adelaide, Perth, Canberra, Newcastle, Wollongong).

### Key Beta Success Metrics:

- **Opportunity Match Usability**: > 75% of matched candidates complete at least one search save or company watch.
- **Explainability Comprehension**: Zero confusion reports regarding score breakdown or sponsorship citations.
- **Zero Severity-1 / Severity-2 Defects**: All critical and major functional defects resolved before general availability.

---

## 2. Defect Severity Classification & SLA

All reported feedback and operational issues during the controlled beta are classified using the following standard:

| Severity                     | Definition                                                                                                                            | Target Resolution SLA | Release Impact                         |
| :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :-------------------- | :------------------------------------- |
| **Severity 1 (Critical)**    | Core discovery journey blocked (e.g. map fails to render, search crashes, auth failure, rate limiter blocks legitimate traffic).      | **< 4 hours**         | Blocks general availability launch     |
| **Severity 2 (Major)**       | Misleading data or broken feature with a workaround (e.g. incorrect sponsorship tag, score calculation mismatch, broken export link). | **< 24 hours**        | Must be resolved before public release |
| **Severity 3 (Minor)**       | Visual inconsistency, minor text typo, or non-blocking UI layout misalignment on non-standard viewports.                              | **< 3 business days** | Can be resolved in scheduled patch     |
| **Severity 4 (Enhancement)** | Feature requests, additional filter ideas, or new ATS connector suggestions.                                                          | Backlogged            | Evaluated for Phase 9 roadmap          |

---

## 3. Beta Feedback & Monitoring Procedures

1. **Direct User Feedback Channel**:
   - In-app feedback link in footer and `/corrections` route routing to `beta-feedback@austechmap.internal`.
2. **Staff Anomaly Surveillance**:
   - Staff reviewers inspect `/admin/monitoring` daily to catch unmapped locations, unclassified employers, or stale observations.
3. **Weekly Beta Review & Launch Approval**:
   - Product Lead and Engineering review beta bug reports and verify that the Severity-1 and Severity-2 queues are zero before approving general public launch.
