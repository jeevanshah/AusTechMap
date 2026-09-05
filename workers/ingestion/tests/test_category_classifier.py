from __future__ import annotations

import pytest

from austechmap_ingestion.employers.category_classifier import classify_company_niches


@pytest.mark.parametrize(
    ("reason", "expected"),
    [
        (
            # A generic "software" mention alone must not imply "saas" --
            # that keyword is deliberately narrow (requires "saas" or
            # "software as a service" literally) to avoid tagging nearly
            # every company in the cohort.
            "Global collaboration software giant (Jira, Confluence), founded in "
            "Sydney with major local R&D",
            set(),
        ),
        (
            "Workplace operations, safety inspection, and sensor IoT platform, "
            "Sydney HQ with tech hub in Townsville",
            {("iot", 0.6)},
        ),
        (
            "Global logistics execution SaaS (CargoWise), ASX-listed tech anchor "
            "headquartered in Alexandria",
            {("saas", 0.6), ("logistics-tech", 0.6)},
        ),
        # Deliberate non-match: a real, well-formed reason with no keyword
        # hit against any niche -- must return an empty list, never a
        # guessed category.
        ("Founded in Sydney, backed by local venture capital investors", set()),
    ],
)
def test_classify_company_niches(reason: str, expected: set[tuple[str, float]]) -> None:
    assert set(classify_company_niches(reason)) == expected


def test_classify_company_niches_is_case_insensitive() -> None:
    assert classify_company_niches("A FINTECH company") == [("fintech", 0.6)]


def test_classify_company_niches_does_not_match_inside_a_longer_word() -> None:
    # "iot" must not fire on "riot" -- a naive substring check would.
    assert classify_company_niches("Makes a riot of colourful games") == []
