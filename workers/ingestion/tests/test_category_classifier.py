from __future__ import annotations

import pytest

from austechmap_ingestion.employers.category_classifier import classify_company_niches


@pytest.mark.parametrize(
    ("reason", "expected"),
    [
        (
            # "collaboration software" is a specific, recognised SaaS
            # category term (real gap found running this against
            # production: Atlassian's actual reason text) -- unlike a bare
            # "software" mention, which stays a deliberate non-match below.
            "Global collaboration software giant (Jira, Confluence), founded in "
            "Sydney with major local R&D",
            {("saas", 0.6)},
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
        (
            # "cellular agriculture" is a specific, recognised term for
            # lab-grown-food agricultural biotech (real gap found running
            # this against production: Vow's actual reason text).
            "Cellular agriculture and computational biology food tech pioneer, "
            "Alexandria/Sydney",
            {("agritech", 0.6)},
        ),
        (
            # A generic "software"/"platform" mention alone must not imply
            # "saas" -- those keywords are deliberately narrow to avoid
            # tagging nearly every company in the cohort. Canva's real
            # reason text has no good fit in the frozen 32-niche taxonomy
            # (no design/creative-tech niche exists) -- an honest
            # non-match, not a classifier bug.
            "Global visual communication and graphic design platform, Sydney HQ "
            "with 1,000+ local engineers and designers",
            set(),
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
