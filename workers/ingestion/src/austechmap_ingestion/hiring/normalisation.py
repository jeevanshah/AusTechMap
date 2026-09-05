"""Deterministic normalisation and classification for job postings
(Phase 5). Pure functions, no DB access -- mirrors the
employers/normalisation.py vs employers/matching.py split.

Role family, seniority, and work-style classification are all rule-based
keyword lookups, checked in a fixed and documented order, never a guess:
a title/department that matches nothing yields None (role family) or
'unknown' (seniority/work-style), per PRODUCT_SPEC.md §7.5's "deterministic
rules first... never guess" AI-enrichment guardrail. Every keyword check
is a word-boundary regex match, not a naive substring check -- a naive
`"ai" in title` would false-positive inside "email" or "main".
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from dataclasses import dataclass

from austechmap_ingestion.hiring.company_sources import AtsProvider
from austechmap_ingestion.hiring.types import RawJobPosting

# Keys match role_families.key seeded from PRODUCT_SPEC.md Appendix A.2,
# checked in this order -- the first family with any keyword match wins.
# Department is checked before title.
ROLE_FAMILY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "software-engineering": (
        "software engineer",
        "frontend",
        "front-end",
        "front end",
        "backend",
        "back-end",
        "back end",
        "full stack",
        "fullstack",
        "mobile engineer",
        "ios engineer",
        "android engineer",
        "embedded",
        "staff engineer",
        "principal engineer",
    ),
    "data": (
        "data analyst",
        "analytics engineer",
        "data engineer",
        "data scientist",
        "data science",
    ),
    "ai-ml": (
        "ml engineer",
        "machine learning",
        "ai engineer",
        "applied scientist",
        "mlops",
        "artificial intelligence",
    ),
    "cloud-platform": (
        "cloud engineer",
        "platform engineer",
        "devops",
        "site reliability",
        "sre",
    ),
    "security": (
        "cybersecurity",
        "security engineer",
        "security analyst",
        "grc",
        "appsec",
        "application security",
    ),
    "quality": (
        "qa engineer",
        "quality assurance",
        "test automation",
        "performance test",
        "sdet",
    ),
    "product-delivery": (
        "product manager",
        "technical business analyst",
        "business analyst",
        "delivery manager",
        "program manager",
        "scrum master",
        "product owner",
    ),
    "design": (
        "product designer",
        "ux research",
        "user research",
        "user experience",
        "ux/ui",
    ),
    "architecture": (
        "solution architect",
        "enterprise architect",
        "data architect",
        "software architect",
    ),
    "it-infrastructure": (
        "systems administrator",
        "network engineer",
        "it support",
        "end user computing",
        "helpdesk",
        "service desk",
        "infrastructure engineer",
    ),
}

# Checked in this order: a title matching both 'senior' and 'manager'
# classifies as management -- a documented, adjustable policy constant,
# not hidden magic.
SENIORITY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "management": ("manager", "director", "head of", "vp", "chief"),
    "staff_principal": ("staff engineer", "principal", "distinguished engineer"),
    "senior": ("senior", "sr."),
    "junior": ("junior", "jr.", "graduate", "new grad", "intern", "internship", "entry level"),
}

_GRADUATE_KEYWORDS = ("graduate", "new grad", "entry level")
_INTERNSHIP_KEYWORDS = ("intern", "internship")

_LEVER_WORK_STYLE_MAP = {"remote": "remote", "hybrid": "hybrid", "on-site": "onsite"}
_ASHBY_WORK_STYLE_MAP = {"remote": "remote", "hybrid": "hybrid", "onsite": "onsite"}
# Greenhouse's public job-board API has no equivalent field at all -- raw
# is always None for it, so map_work_style's early return handles it
# before this mapping is ever consulted.
_WORK_STYLE_MAPS: dict[AtsProvider, dict[str, str]] = {
    "lever": _LEVER_WORK_STYLE_MAP,
    "ashby": _ASHBY_WORK_STYLE_MAP,
    "greenhouse": {},
}

_TITLE_MATCH_CONFIDENCE = 0.7
_DESCRIPTION_MATCH_CONFIDENCE = 0.5


def _matches_any_keyword(text: str, keywords: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{re.escape(keyword)}\b", text, re.IGNORECASE) for keyword in keywords)


def classify_role_family(*, title: str, department: str | None) -> str | None:
    for family_key, keywords in ROLE_FAMILY_KEYWORDS.items():
        if department and _matches_any_keyword(department, keywords):
            return family_key
        if _matches_any_keyword(title, keywords):
            return family_key
    return None


def classify_seniority(title: str) -> str:
    for level, keywords in SENIORITY_KEYWORDS.items():
        if _matches_any_keyword(title, keywords):
            return level
    return "unknown"


def classify_graduate_flags(title: str) -> tuple[bool, bool]:
    graduate_role = _matches_any_keyword(title, _GRADUATE_KEYWORDS)
    internship_role = _matches_any_keyword(title, _INTERNSHIP_KEYWORDS)
    return graduate_role, internship_role


def map_work_style(provider: AtsProvider, raw: str | None) -> str:
    if raw is None:
        return "unknown"
    normalised = raw.strip().lower()
    return _WORK_STYLE_MAPS[provider].get(normalised, "unknown")


def normalise_title(title: str) -> str:
    return re.sub(r"\s+", " ", title).strip().lower()


@dataclass(frozen=True)
class SkillDef:
    key: str
    label: str
    aliases: tuple[str, ...]


def extract_skills(
    *, title: str, description_text: str | None, skills: Sequence[SkillDef]
) -> list[tuple[str, float]]:
    """Word-boundary match against each skill's key/label/aliases
    (case-insensitive) in the title and, separately, the description --
    a title match scores higher than a description-only match. A real
    statistical confidence model is out of scope this pass."""
    matches: list[tuple[str, float]] = []
    for skill in skills:
        candidates = (skill.key.replace("_", " "), skill.label, *skill.aliases)
        if _matches_any_keyword(title, candidates):
            matches.append((skill.key, _TITLE_MATCH_CONFIDENCE))
        elif description_text and _matches_any_keyword(description_text, candidates):
            matches.append((skill.key, _DESCRIPTION_MATCH_CONFIDENCE))
    return matches


@dataclass(frozen=True)
class NormalisedJob:
    normalized_title: str
    role_family_key: str | None
    seniority: str
    remote_type: str
    graduate_role: bool
    internship_role: bool
    salary_min: float | None
    salary_max: float | None
    salary_period: str | None
    content_hash: str


def compute_job_content_hash(
    *,
    title: str,
    department: str | None,
    location_text: str | None,
    employment_type_raw: str | None,
    remote_type: str,
    description_text: str | None,
    salary_min: float | None,
    salary_max: float | None,
    salary_period: str | None,
) -> str:
    """sha256 over an explicitly-listed canonical field set -- NOT the
    full raw ATS blob, which can reorder or add noisy fields (e.g. an
    updated 'lists' HTML section) with no real content change."""
    canonical = "\x1f".join(
        "" if value is None else str(value)
        for value in (
            title,
            department,
            location_text,
            employment_type_raw,
            remote_type,
            description_text,
            salary_min,
            salary_max,
            salary_period,
        )
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalise_job(
    posting: RawJobPosting, *, provider: AtsProvider, skills: Sequence[SkillDef]
) -> tuple[NormalisedJob, list[tuple[str, float]]]:
    """Ties the individual classification steps together into the one
    shape persistence.py needs. Salary parsing is out of scope this pass
    (neither verified Lever nor Ashby response included salary data) --
    always None rather than guessed."""
    role_family_key = classify_role_family(title=posting.title, department=posting.department)
    seniority = classify_seniority(posting.title)
    remote_type = map_work_style(provider, posting.remote_type_raw)
    graduate_role, internship_role = classify_graduate_flags(posting.title)
    skill_matches = extract_skills(
        title=posting.title, description_text=posting.description_text, skills=skills
    )
    content_hash = compute_job_content_hash(
        title=posting.title,
        department=posting.department,
        location_text=posting.location_text,
        employment_type_raw=posting.employment_type_raw,
        remote_type=remote_type,
        description_text=posting.description_text,
        salary_min=None,
        salary_max=None,
        salary_period=None,
    )
    normalised = NormalisedJob(
        normalized_title=normalise_title(posting.title),
        role_family_key=role_family_key,
        seniority=seniority,
        remote_type=remote_type,
        graduate_role=graduate_role,
        internship_role=internship_role,
        salary_min=None,
        salary_max=None,
        salary_period=None,
        content_hash=content_hash,
    )
    return normalised, skill_matches
