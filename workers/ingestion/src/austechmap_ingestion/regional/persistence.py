"""Database-backed generation of Phase 6B regional opportunity scores."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import cast

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.regional.scoring import (
    RegionalScoreInputs,
    input_fingerprint,
    score_region,
)


@dataclass(frozen=True)
class GeneratedRegionalScore:
    id: uuid.UUID
    region_code: str
    score: float | None
    sufficient: bool
    suppression_reasons: tuple[str, ...]
    created: bool


def _load_inputs(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    region_id: uuid.UUID,
    current_start: date,
    previous_start: date,
    period_end: date,
) -> RegionalScoreInputs:
    row = connection.execute(
        """
        WITH region_companies AS (
          SELECT DISTINCT cl.company_id
          FROM company_locations cl
          JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
          JOIN companies c ON c.id = cl.company_id
          WHERE rl.sa4_region_id = %(region_id)s
            AND c.status NOT IN ('merged', 'disabled')
        ),
        regional_jobs AS (
          SELECT j.*
          FROM jobs j
          JOIN company_locations cl ON cl.id = j.company_location_id
          JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
          WHERE rl.sa4_region_id = %(region_id)s
        ),
        observation_stats AS (
          SELECT
            COUNT(DISTINCT jo.job_id) FILTER (
              WHERE jo.active
                AND jo.observed_at::date BETWEEN %(current_start)s AND %(period_end)s
            ) AS current_window_jobs,
            COUNT(DISTINCT jo.job_id) FILTER (
              WHERE jo.active
                AND jo.observed_at::date >= %(previous_start)s
                AND jo.observed_at::date < %(current_start)s
            ) AS previous_window_jobs,
            COALESCE(MAX(jo.observed_at)::date - MIN(jo.observed_at)::date, 0) AS history_days,
            COUNT(DISTINCT jo.observed_at::date) AS observation_dates
          FROM job_observations jo
          JOIN regional_jobs rj ON rj.id = jo.job_id
          WHERE jo.observed_at::date BETWEEN %(previous_start)s AND %(period_end)s
        )
        SELECT
          (SELECT COUNT(*) FROM region_companies) AS employer_count,
          (SELECT COUNT(*) FROM region_companies rc WHERE EXISTS (
            SELECT 1 FROM company_ats_sources cas
            WHERE cas.company_id = rc.company_id AND cas.status = 'active'
          )) AS monitored_employer_count,
          (SELECT COUNT(*) FROM regional_jobs WHERE expired_at IS NULL) AS active_jobs,
          os.current_window_jobs,
          os.previous_window_jobs,
          os.history_days,
          os.observation_dates,
          (SELECT COUNT(DISTINCT ccl.category_id)
           FROM company_category_links ccl
           JOIN region_companies rc ON rc.company_id = ccl.company_id
          ) AS industry_count,
          (SELECT COUNT(*) FROM regional_jobs
           WHERE expired_at IS NULL AND remote_type IN ('remote', 'hybrid', 'flexible_mixed')
          ) AS remote_hybrid_jobs,
          (SELECT COUNT(*) FROM regional_jobs
           WHERE expired_at IS NULL AND (graduate_role OR internship_role OR seniority = 'junior')
          ) AS early_career_jobs,
          (SELECT COUNT(*) FROM region_companies rc WHERE EXISTS (
            SELECT 1 FROM evidence e
            WHERE e.entity_type = 'company' AND e.entity_id = rc.company_id::text
              AND e.claim_type IN (
                'sponsorship_current_explicit', 'sponsorship_labour_agreement'
              )
              AND e.status = 'active'
          )) AS sponsorship_employer_count,
          COALESCE((
            SELECT MAX(CASE rl.migration_category
              WHEN 'dama' THEN 1.0
              WHEN 'category_3' THEN 0.75
              WHEN 'category_2' THEN 0.25
              ELSE 0.0
            END)
            FROM resolved_locations rl
            WHERE rl.sa4_region_id = %(region_id)s
          ), 0.0) AS migration_context_strength
        FROM observation_stats os
        """,
        {
            "region_id": region_id,
            "current_start": current_start,
            "previous_start": previous_start,
            "period_end": period_end,
        },
    ).fetchone()
    assert row is not None

    directions = {
        cast(str, dataset): cast(float | None, direction)
        for dataset, direction in connection.execute(
            """
            SELECT DISTINCT ON (dataset) dataset::text, direction
            FROM regional_labor_observations
            WHERE region_id = %(region_id)s
              AND role_family_id IS NULL
              AND period_end <= %(period_end)s
            ORDER BY dataset, period_end DESC, observed_at DESC
            """,
            {"region_id": region_id, "period_end": period_end},
        ).fetchall()
    }

    return RegionalScoreInputs(
        employer_count=cast(int, row[0]),
        monitored_employer_count=cast(int, row[1]),
        active_jobs=cast(int, row[2]),
        current_window_jobs=cast(int, row[3]),
        previous_window_jobs=cast(int, row[4]),
        hiring_history_days=cast(int, row[5]),
        hiring_observation_dates=cast(int, row[6]),
        industry_count=cast(int, row[7]),
        remote_hybrid_jobs=cast(int, row[8]),
        early_career_jobs=cast(int, row[9]),
        sponsorship_employer_count=cast(int, row[10]),
        migration_context_strength=float(cast(int | float, row[11])),
        nero_direction=directions.get("nero"),
        ivi_direction=directions.get("ivi"),
    )


def generate_region_opportunity_scores(
    database_url: str,
    *,
    region_code: str | None = None,
    period_end: date | None = None,
    generated_at: datetime | None = None,
) -> tuple[GeneratedRegionalScore, ...]:
    end = period_end if period_end is not None else date.today()
    generated = generated_at if generated_at is not None else datetime.now(UTC)
    current_start = end - timedelta(days=29)
    previous_start = end - timedelta(days=59)

    results: list[GeneratedRegionalScore] = []
    with psycopg.connect(database_url) as connection:
        regions = connection.execute(
            """
            SELECT r.id, r.code
            FROM regions r
            JOIN geography_releases gr ON gr.id = r.release_id
            WHERE r.region_type = 'sa4'
              AND gr.dataset = 'asgs_sa4'
              AND gr.is_active
              AND (%(region_code)s IS NULL OR r.code = %(region_code)s)
            ORDER BY r.code
            """,
            {"region_code": region_code},
        ).fetchall()
        if region_code is not None and not regions:
            raise ValueError(f"active SA4 region {region_code!r} was not found")

        for raw_region_id, raw_region_code in regions:
            region_id = cast(uuid.UUID, raw_region_id)
            code = cast(str, raw_region_code)
            inputs = _load_inputs(
                connection,
                region_id=region_id,
                current_start=current_start,
                previous_start=previous_start,
                period_end=end,
            )
            scored = score_region(inputs)
            fingerprint = input_fingerprint(inputs)
            inserted = connection.execute(
                """
                INSERT INTO region_opportunity_scores (
                  region_id, role_family_id, period_start, period_end, score,
                  components_json, methodology_version, sufficiency_json,
                  input_fingerprint, generated_at
                )
                VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                (
                    region_id,
                    previous_start,
                    end,
                    scored.score,
                    Jsonb(scored.components),
                    scored.methodology_version,
                    Jsonb(scored.sufficiency),
                    fingerprint,
                    generated,
                ),
            ).fetchone()
            created = inserted is not None
            if inserted is None:
                inserted = connection.execute(
                    """
                    SELECT id FROM region_opportunity_scores
                    WHERE region_id = %s AND role_family_id IS NULL
                      AND period_start = %s AND period_end = %s
                      AND methodology_version = %s AND input_fingerprint = %s
                    """,
                    (region_id, previous_start, end, scored.methodology_version, fingerprint),
                ).fetchone()
            assert inserted is not None
            results.append(
                GeneratedRegionalScore(
                    id=cast(uuid.UUID, inserted[0]),
                    region_code=code,
                    score=scored.score,
                    sufficient=scored.sufficiency["sufficient"],
                    suppression_reasons=tuple(scored.sufficiency["reasons"]),
                    created=created,
                )
            )

    return tuple(results)
