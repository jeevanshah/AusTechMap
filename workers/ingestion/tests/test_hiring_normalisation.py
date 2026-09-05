from __future__ import annotations

import pytest

from austechmap_ingestion.hiring.normalisation import (
    SkillDef,
    classify_graduate_flags,
    classify_role_family,
    classify_seniority,
    compute_job_content_hash,
    extract_skills,
    map_work_style,
    normalise_job,
    normalise_title,
)
from austechmap_ingestion.hiring.types import RawJobPosting


@pytest.mark.parametrize(
    ("title", "department", "expected"),
    [
        ("Senior Platform Engineer", "Engineering", "cloud-platform"),
        ("Backend Software Engineer", None, "software-engineering"),
        ("Data Scientist", None, "data"),
        ("Machine Learning Engineer", None, "ai-ml"),
        ("Security Engineer", None, "security"),
        ("QA Engineer", None, "quality"),
        ("Product Manager", None, "product-delivery"),
        ("Senior Product Designer", None, "design"),
        ("Solution Architect", None, "architecture"),
        ("IT Support Officer", None, "it-infrastructure"),
        # Deliberate non-match: a real title from the Lever fixture that
        # doesn't correspond to any frozen role family -- must return
        # None, never a guessed family.
        ("Chief of Staff, CCO", "Go to Market", None),
    ],
)
def test_classify_role_family(title: str, department: str | None, expected: str | None) -> None:
    assert classify_role_family(title=title, department=department) == expected


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Engineering Manager", "management"),
        ("Staff Engineer", "staff_principal"),
        ("Senior Platform Engineer", "senior"),
        ("Graduate Software Engineer", "junior"),
        # Deliberate non-match -- no seniority keyword present.
        ("Software Engineer", "unknown"),
    ],
)
def test_classify_seniority(title: str, expected: str) -> None:
    assert classify_seniority(title) == expected


def test_classify_seniority_prefers_management_over_senior_when_both_match() -> None:
    assert classify_seniority("Senior Engineering Manager") == "management"


@pytest.mark.parametrize(
    ("title", "graduate", "internship"),
    [
        ("Graduate Software Engineer", True, False),
        ("Software Engineering Intern", False, True),
        ("Senior Platform Engineer", False, False),
    ],
)
def test_classify_graduate_flags(title: str, graduate: bool, internship: bool) -> None:
    assert classify_graduate_flags(title) == (graduate, internship)


@pytest.mark.parametrize(
    ("provider", "raw", "expected"),
    [
        ("lever", "hybrid", "hybrid"),
        ("lever", "remote", "remote"),
        ("lever", "on-site", "onsite"),
        ("ashby", "Hybrid", "hybrid"),
        ("ashby", "Remote", "remote"),
        ("ashby", "OnSite", "onsite"),
        ("lever", None, "unknown"),
        ("ashby", "some-future-value", "unknown"),
        # Greenhouse's public API has no equivalent field at all -- raw is
        # always None for it, always resolving to "unknown".
        ("greenhouse", None, "unknown"),
    ],
)
def test_map_work_style(provider: str, raw: str | None, expected: str) -> None:
    assert map_work_style(provider, raw) == expected  # type: ignore[arg-type]


def test_normalise_title_collapses_whitespace_and_lowercases() -> None:
    assert normalise_title("  Senior   Platform Engineer ") == "senior platform engineer"


_SKILLS = (
    SkillDef(key="python", label="Python", aliases=()),
    SkillDef(key="react", label="React", aliases=("React.js", "ReactJS")),
    SkillDef(key="kubernetes", label="Kubernetes", aliases=("K8s",)),
)


def test_extract_skills_scores_a_title_match_higher_than_a_description_match() -> None:
    matches = extract_skills(
        title="Senior Python Engineer",
        description_text="Experience with Kubernetes required.",
        skills=_SKILLS,
    )
    assert ("python", 0.7) in matches
    assert ("kubernetes", 0.5) in matches
    assert not any(key == "react" for key, _ in matches)


def test_extract_skills_matches_via_alias() -> None:
    matches = extract_skills(title="ReactJS Developer", description_text=None, skills=_SKILLS)
    assert matches == [("react", 0.7)]


def test_extract_skills_returns_empty_for_no_match() -> None:
    assert extract_skills(title="Chief of Staff", description_text=None, skills=_SKILLS) == []


def _hash_kwargs(**overrides: object) -> dict[str, object]:
    defaults: dict[str, object] = {
        "title": "Senior Platform Engineer",
        "department": "Engineering",
        "location_text": "Sydney",
        "employment_type_raw": "FullTime",
        "remote_type": "hybrid",
        "description_text": "Some description.",
        "salary_min": None,
        "salary_max": None,
        "salary_period": None,
    }
    defaults.update(overrides)
    return defaults


def test_compute_job_content_hash_is_stable_for_identical_input() -> None:
    assert compute_job_content_hash(**_hash_kwargs()) == compute_job_content_hash(**_hash_kwargs())  # type: ignore[arg-type]


def test_compute_job_content_hash_changes_when_a_canonical_field_changes() -> None:
    base = compute_job_content_hash(**_hash_kwargs())  # type: ignore[arg-type]
    changed = compute_job_content_hash(**_hash_kwargs(location_text="Melbourne"))  # type: ignore[arg-type]
    assert base != changed


def _posting(**overrides: object) -> RawJobPosting:
    defaults: dict[str, object] = {
        "external_id": "1",
        "title": "Senior Platform Engineer",
        "department": "Engineering",
        "team": "Engineering",
        "location_text": "Sydney",
        "employment_type_raw": "FullTime",
        "remote_type_raw": "Hybrid",
        "country": None,
        "posted_at": None,
        "source_url": "https://example.test/1",
        "apply_url": None,
        "description_html": None,
        "description_text": "Some description.",
        "raw": {},
    }
    defaults.update(overrides)
    return RawJobPosting(**defaults)  # type: ignore[arg-type]


def test_normalise_job_content_hash_is_unaffected_by_the_raw_blob() -> None:
    # Simulates the raw ATS blob reordering/adding a noisy field (e.g. an
    # updated "lists" HTML section) with no real content change -- the
    # hash must come only from the explicitly-listed canonical fields
    # normalise_job extracts, not from posting.raw itself.
    first, _ = normalise_job(
        _posting(raw={"lists": ["a"]}), provider="ashby", skills=()
    )
    second, _ = normalise_job(
        _posting(raw={"lists": ["a", "b"], "extraNoise": 123}), provider="ashby", skills=()
    )
    assert first.content_hash == second.content_hash
