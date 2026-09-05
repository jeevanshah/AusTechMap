"""Seeds `categories` (verbatim from PRODUCT_SPEC.md Appendix A.1, a
genuinely frozen taxonomy) as a two-level hierarchy: 7 top-level groups
(`parent_id IS NULL`) and their niche labels as children referencing the
group's id. Idempotent upsert, matching hiring/taxonomy_seed.py's
established convention: plain Python constants, not inline migration
INSERT.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import cast
from uuid import UUID

import psycopg

CATEGORY_GROUPS: tuple[tuple[str, str], ...] = (
    ("software", "Software"),
    ("financial", "Financial"),
    ("industry-technology", "Industry Technology"),
    ("public-social", "Public / Social"),
    ("deep-specialised", "Deep / Specialised"),
    ("consumer-media", "Consumer / Media"),
    ("services", "Services"),
)

# (niche key, label, parent group key) -- verbatim from Appendix A.1's
# "Example labels" column.
CATEGORY_NICHES: tuple[tuple[str, str, str], ...] = (
    ("saas", "SaaS", "software"),
    ("enterprise-software", "Enterprise Software", "software"),
    ("developer-tools", "Developer Tools", "software"),
    ("cloud", "Cloud", "software"),
    ("devops", "DevOps", "software"),
    ("data-platforms", "Data Platforms", "software"),
    ("fintech", "Fintech", "financial"),
    ("payments", "Payments", "financial"),
    ("banking-technology", "Banking Technology", "financial"),
    ("insurtech", "Insurtech", "financial"),
    ("mining-tech", "Mining Tech", "industry-technology"),
    ("agritech", "Agritech", "industry-technology"),
    ("construction-tech", "Construction Tech", "industry-technology"),
    ("proptech", "Proptech", "industry-technology"),
    ("logistics-tech", "Logistics Tech", "industry-technology"),
    ("govtech", "GovTech", "public-social"),
    ("edtech", "EdTech", "public-social"),
    ("healthtech", "Healthtech", "public-social"),
    ("climate-tech", "Climate Tech", "public-social"),
    ("ai-ml", "AI/ML", "deep-specialised"),
    ("cybersecurity", "Cybersecurity", "deep-specialised"),
    ("robotics", "Robotics", "deep-specialised"),
    ("space", "Space", "deep-specialised"),
    ("defence-tech", "Defence Tech", "deep-specialised"),
    ("iot", "IoT", "deep-specialised"),
    ("ecommerce", "E-commerce", "consumer-media"),
    ("marketplace", "Marketplace", "consumer-media"),
    ("gaming", "Gaming", "consumer-media"),
    ("media-technology", "Media Technology", "consumer-media"),
    ("technology-consulting", "Technology Consulting", "services"),
    ("managed-services", "Managed Services", "services"),
    ("systems-integration", "Systems Integration", "services"),
)


@dataclass(frozen=True)
class CategorySeedStats:
    groups_created: int
    niches_created: int


def _upsert_category(
    connection: psycopg.Connection[tuple[object, ...]],
    key: str,
    label: str,
    parent_id: UUID | None,
) -> tuple[UUID, bool]:
    row = connection.execute(
        """
        INSERT INTO categories (key, label, parent_id)
        VALUES (%s, %s, %s)
        ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key
        RETURNING id, (xmax = 0) AS inserted
        """,
        (key, label, parent_id),
    ).fetchone()
    assert row is not None
    return cast(UUID, row[0]), cast(bool, row[1])


def seed_categories(database_url: str) -> CategorySeedStats:
    groups_created = niches_created = 0
    with psycopg.connect(database_url, autocommit=True) as connection:
        group_ids: dict[str, UUID] = {}
        for key, label in CATEGORY_GROUPS:
            group_id, created = _upsert_category(connection, key, label, None)
            group_ids[key] = group_id
            if created:
                groups_created += 1

        for key, label, parent_key in CATEGORY_NICHES:
            _, created = _upsert_category(connection, key, label, group_ids[parent_key])
            if created:
                niches_created += 1

    return CategorySeedStats(groups_created=groups_created, niches_created=niches_created)
