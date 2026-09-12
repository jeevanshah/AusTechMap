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
    "smartrecruiters": {"remote": "remote", "hybrid": "hybrid", "onsite": "onsite"},
    "workable": {"remote": "remote", "hybrid": "hybrid", "onsite": "onsite"},
    "breezy": {"remote": "remote", "onsite": "onsite"},
    "static_careers": {},
    "pinpoint": {"remote": "remote", "hybrid": "hybrid", "onsite": "onsite"},
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


_AUSTRALIAN_EXPLICIT_PATTERNS = re.compile(
    r"\b("
    r"australia|australian|anz|aus|"
    r"nsw|vic|qld|wa|sa|act|tas|nt|"
    r"new\s+south\s+wales|victoria|queensland|western\s+australia|south\s+australia|"
    r"tasmania|northern\s+territory"
    r")\b",
    re.IGNORECASE,
)

_AUSTRALIAN_CITY_PATTERNS = re.compile(
    r"\b("
    r"sydney|melbourne|brisbane|perth|adelaide|canberra|hobart|darwin|"
    r"gold\s+coast|sunshine\s+coast|newcastle|wollongong|geelong|ballarat|bendigo|"
    r"toowoomba|cairns|townsville|albury|wodonga|launceston|echuca|"
    r"barangaroo|pyrmont|surry\s+hills|north\s+sydney|macquarie\s+park|parramatta|"
    r"cremorne|richmond|southbank|docklands|fortitude\s+valley|kurnell|brendale|dandenong"
    r")\b",
    re.IGNORECASE,
)

_EXPLICIT_FOREIGN_PATTERNS = re.compile(
    r"\b("
    r"united\s+states|usa|america|united\s+kingdom|uk|gb|great\s+britain|england|scotland|wales|"
    r"ireland|canada|philippines|singapore|japan|india|germany|deutschland|france|spain|españa|"
    r"italy|italia|netherlands|holland|poland|portugal|new\s+zealand|nz|south\s+africa|brazil|brasil|"
    r"mexico|qatar|saudi\s+arabia|uae|dubai|abu\s+dhabi|malaysia|china|taiwan|hong\s+kong|korea|vietnam|"
    r"indonesia|sweden|switzerland|austria|denmark|norway|finland|"
    r"san\s+francisco|new\s+york|chicago|los\s+angeles|seattle|mountain\s+view|austin|texas|california|"
    r"denver|colorado|boston|virginia|georgia|atlanta|kansas\s+city|florida|orlando|carlsbad|la\s+grange|"
    r"salt\s+lake\s+city|nevada|sparks|phoenix|arizona|glendale|clearwater|fort\s+worth|oregon|portland|"
    r"dallas|houston|toronto|montreal|vancouver|calgary|alberta|ontario|london|manchester|belfast|edinburgh|"
    r"newcastle\s+upon\s+tyne|dublin|manila|taguig|tokyo|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|"
    r"gurugram|chennai|berlin|munich|frankfurt|paris|barcelona|madrid|milan|rome|amsterdam|warsaw|lisbon|"
    r"auckland|christchurch|wellington|palmerston\s+north|são\s+paulo|sao\s+paulo|kuala\s+lumpur|shanghai|"
    r"shenzhen|beijing|seoul"
    r")\b",
    re.IGNORECASE,
)

_FOREIGN_COUNTRY_CODE_SUFFIX = re.compile(
    r",\s*(?:us|gb|uk|nz|ca|in|sg|ph|my|de|fr|ie|jp|nl|br|pl|se|ch|at|dk|no|fi)\b",
    re.IGNORECASE,
)

_AU_COUNTRY_CODE = re.compile(
    r"(?:,\s*|\b)au(?:\b|\s*,|\s*$)|(?:^|\b)au\s*-\s*",
    re.IGNORECASE,
)


def is_australian_location(location_text: str | None) -> bool:
    """Determine whether an ATS raw location represents an Australian position.

    Returns True if an explicit Australian state, city, precinct, or country code
    is present, or if it indicates Australia-wide remote.
    Returns False if location is absent, or mentions explicitly foreign jurisdictions
    without Australian presence.
    """
    if not location_text or not location_text.strip():
        return False
    cleaned = location_text.strip()

    has_foreign_suffix = bool(_FOREIGN_COUNTRY_CODE_SUFFIX.search(cleaned))
    has_explicit_au = bool(_AUSTRALIAN_EXPLICIT_PATTERNS.search(cleaned))
    has_explicit_foreign = bool(_EXPLICIT_FOREIGN_PATTERNS.search(cleaned))
    has_au_code = bool(_AU_COUNTRY_CODE.search(cleaned))

    # If tagged with a foreign country suffix (e.g. ', us', ', gb') and no explicit AU
    if has_foreign_suffix and not has_explicit_au:
        return False

    # If tagged with explicit foreign country/city and no explicit AU
    if has_explicit_foreign and not has_explicit_au:
        return False

    # Explicit AU mentions (Australia, NSW, VIC, etc.) or AU code
    if has_explicit_au or has_au_code:
        return True

    # Australian city matches (e.g. "Sydney", "Melbourne") when no foreign markers
    has_city = bool(_AUSTRALIAN_CITY_PATTERNS.search(cleaned))
    if has_city and not has_explicit_foreign:
        return True

    return False
