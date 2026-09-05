"""Applies employers/category_classifier.py's niche classification to
every active company's seed-research "reason" text, persisting matches
as company_category_links rows. Read-classify-write against evidence
employers/seed.py already durably recorded -- not a new external fetch,
so there is no snapshot to take here.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg

from austechmap_ingestion.employers.category_classifier import classify_company_niches
from austechmap_ingestion.jobs import JobRepository

SOURCE_KEY = "employer-category-classification"
_METHOD = "keyword_match"


@dataclass(frozen=True)
class CategoryApplyStats:
    companies_considered: int
    companies_matched: int
    links_created: int
    companies_without_reason: tuple[str, ...]


def apply_company_categories(database_url: str) -> CategoryApplyStats:
    source_id = JobRepository(database_url).ensure_source(
        source_key=SOURCE_KEY,
        name="Employer category classification (keyword match on seed research)",
        kind="derived",
    )

    considered = matched = links_created = 0
    without_reason: list[str] = []
    with psycopg.connect(database_url, autocommit=True) as connection:
        companies = connection.execute(
            """
            SELECT DISTINCT ON (c.id) c.id, c.display_name, e.claim_value ->> 'reason'
            FROM companies c
            JOIN evidence e
              ON e.entity_type = 'company'
             AND e.entity_id = c.id::text
             AND e.claim_type = 'employer_seed_research'
            WHERE c.status NOT IN ('merged', 'disabled')
            ORDER BY c.id, e.observed_at DESC
            """
        ).fetchall()

        for company_id, display_name, reason in companies:
            considered += 1
            if not reason:
                without_reason.append(display_name)
                continue

            niche_matches = classify_company_niches(reason)
            if not niche_matches:
                continue
            matched += 1

            for niche_key, confidence in niche_matches:
                category_row = connection.execute(
                    "SELECT id FROM categories WHERE key = %s", (niche_key,)
                ).fetchone()
                if category_row is None:
                    continue
                inserted = connection.execute(
                    """
                    INSERT INTO company_category_links (
                      company_id, category_id, confidence, method, source_id
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (company_id, category_id) DO NOTHING
                    RETURNING id
                    """,
                    (company_id, category_row[0], confidence, _METHOD, source_id),
                ).fetchone()
                if inserted is not None:
                    links_created += 1

    return CategoryApplyStats(
        companies_considered=considered,
        companies_matched=matched,
        links_created=links_created,
        companies_without_reason=tuple(without_reason),
    )
