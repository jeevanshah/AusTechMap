"""Derivation of employer role demand and skill signals (Phase 5).

Implements the automated population of:
- employer_role_signals: aggregates active jobs, new jobs, sample size, and momentum
  per (company_id, role_family_id, period_start, period_end, methodology_version).
  Strictly enforces the sufficiency rule documented in migration 0009:
  sample_size >= 3 across >= 2 distinct observation dates >= 14 days apart.
  When insufficient, momentum is preserved as None (NULL) and sufficient as False.

- employer_skill_signals: aggregates skill demand across active jobs
  per (company_id, skill_id, period_start, period_end, methodology_version).
  Enforces sufficiency rule: evidence_count >= 2 across active roles.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import psycopg

METHODOLOGY_VERSION = 1
DEFAULT_PERIOD_DAYS = 30


@dataclass(frozen=True)
class HiringSignalsStats:
    companies_considered: int
    role_signals_created: int
    role_signals_updated: int
    skill_signals_created: int
    skill_signals_updated: int


def derive_employer_hiring_signals(
    database_url: str,
    *,
    period_end: date | None = None,
    period_days: int = DEFAULT_PERIOD_DAYS,
    methodology_version: int = METHODOLOGY_VERSION,
) -> HiringSignalsStats:
    """Derives and upserts role and skill signals for all companies with hiring data."""
    if period_end is None:
        period_end = datetime.now(UTC).date()
    period_start = period_end - timedelta(days=period_days)

    role_created = 0
    role_updated = 0
    skill_created = 0
    skill_updated = 0
    companies_considered = 0

    with psycopg.connect(database_url, autocommit=True) as connection:
        # Find all companies that have at least one job
        company_rows = connection.execute(
            """
            SELECT DISTINCT company_id
            FROM jobs
            """
        ).fetchall()
        companies_considered = len(company_rows)

        for (company_id,) in company_rows:
            # 1. Derive Role Signals per (company_id, role_family_id)
            # Find distinct role families associated with this company
            role_family_rows = connection.execute(
                """
                SELECT DISTINCT role_family_id
                FROM jobs
                WHERE company_id = %s AND role_family_id IS NOT NULL
                """,
                (company_id,),
            ).fetchall()

            for (role_family_id,) in role_family_rows:
                # Active jobs
                active_res = connection.execute(
                    """
                    SELECT count(*)
                    FROM jobs
                    WHERE company_id = %s AND role_family_id = %s AND expired_at IS NULL
                    """,
                    (company_id, role_family_id),
                ).fetchone()
                active_jobs = active_res[0] if active_res else 0

                # New jobs in period
                new_res = connection.execute(
                    """
                    SELECT count(*)
                    FROM jobs
                    WHERE company_id = %s AND role_family_id = %s
                      AND first_seen_at::date >= %s AND first_seen_at::date <= %s
                    """,
                    (company_id, role_family_id, period_start, period_end),
                ).fetchone()
                new_jobs = new_res[0] if new_res else 0

                # Sample size and distinct observation dates
                obs_rows = connection.execute(
                    """
                    SELECT jo.observed_at::date, count(jo.id)
                    FROM job_observations jo
                    JOIN jobs j ON j.id = jo.job_id
                    WHERE j.company_id = %s AND j.role_family_id = %s
                      AND jo.observed_at::date >= %s AND jo.observed_at::date <= %s
                    GROUP BY jo.observed_at::date
                    ORDER BY jo.observed_at::date
                    """,
                    (company_id, role_family_id, period_start, period_end),
                ).fetchall()

                sample_size = sum(count for _, count in obs_rows)
                observation_dates = [obs_date for obs_date, _ in obs_rows]

                # Sufficiency requires three observations across at least two
                # dates that are at least 14 days apart.
                is_sufficient = False
                momentum: Decimal | None = None

                if len(observation_dates) >= 2 and sample_size >= 3:
                    span_days = (observation_dates[-1] - observation_dates[0]).days
                    if span_days >= 14:
                        is_sufficient = True
                        # Momentum calculation: ratio of new jobs relative to sample size
                        raw_momentum = round(Decimal(new_jobs) / Decimal(sample_size), 4)
                        momentum = raw_momentum

                # Upsert into employer_role_signals
                res = connection.execute(
                    """
                    INSERT INTO employer_role_signals (
                      company_id, role_family_id, period_start, period_end, active_jobs,
                      new_jobs, momentum, sample_size, sufficient, methodology_version, generated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                    ON CONFLICT (
                      company_id, role_family_id, period_start, period_end, methodology_version
                    )
                    DO UPDATE SET
                      active_jobs = EXCLUDED.active_jobs,
                      new_jobs = EXCLUDED.new_jobs,
                      momentum = EXCLUDED.momentum,
                      sample_size = EXCLUDED.sample_size,
                      sufficient = EXCLUDED.sufficient,
                      generated_at = now()
                    RETURNING (xmax = 0) AS is_insert;
                    """,
                    (
                        company_id,
                        role_family_id,
                        period_start,
                        period_end,
                        active_jobs,
                        new_jobs,
                        momentum,
                        sample_size,
                        is_sufficient,
                        methodology_version,
                    ),
                ).fetchone()

                if res and res[0]:
                    role_created += 1
                else:
                    role_updated += 1

            # 2. Derive Skill Signals per (company_id, skill_id) for active jobs
            skill_rows = connection.execute(
                """
                SELECT
                  jsl.skill_id,
                  count(DISTINCT j.id) AS evidence_count,
                  avg(jsl.confidence) AS avg_conf
                FROM job_skill_links jsl
                JOIN jobs j ON j.id = jsl.job_id
                WHERE j.company_id = %s AND j.expired_at IS NULL
                GROUP BY jsl.skill_id
                """,
                (company_id,),
            ).fetchall()

            for skill_id, evidence_count, avg_conf in skill_rows:
                confidence = (
                    Decimal(str(round(float(avg_conf), 2)))
                    if avg_conf is not None
                    else Decimal("0.50")
                )
                is_sufficient = evidence_count >= 2

                res = connection.execute(
                    """
                    INSERT INTO employer_skill_signals (
                      company_id, skill_id, period_start, period_end, evidence_count,
                      confidence, sufficient, methodology_version, generated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                    ON CONFLICT (
                      company_id, skill_id, period_start, period_end, methodology_version
                    )
                    DO UPDATE SET
                      evidence_count = EXCLUDED.evidence_count,
                      confidence = EXCLUDED.confidence,
                      sufficient = EXCLUDED.sufficient,
                      generated_at = now()
                    RETURNING (xmax = 0) AS is_insert;
                    """,
                    (
                        company_id,
                        skill_id,
                        period_start,
                        period_end,
                        evidence_count,
                        confidence,
                        is_sufficient,
                        methodology_version,
                    ),
                ).fetchone()

                if res and res[0]:
                    skill_created += 1
                else:
                    skill_updated += 1

    return HiringSignalsStats(
        companies_considered=companies_considered,
        role_signals_created=role_created,
        role_signals_updated=role_updated,
        skill_signals_created=skill_created,
        skill_signals_updated=skill_updated,
    )
