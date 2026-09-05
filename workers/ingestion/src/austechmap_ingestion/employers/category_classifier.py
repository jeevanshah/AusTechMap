"""Deterministic company-niche classification (category enrichment):
matches Appendix A.1's 32 niche labels against a company's seed-research
"reason" text via word-boundary keyword lookup -- mirrors
hiring/normalisation.py's classify_role_family style, but returns every
matching niche rather than a first-match-wins single value, since a real
company routinely spans more than one niche (e.g. a logistics SaaS
company is both "saas" and "logistics-tech").

A reason with no keyword match yields an empty list, never a guessed
category -- the same "never guess" rule normalisation.py documents.
Deliberately narrow, phrase-level keywords over single generic words
(e.g. "cloud platform" not "cloud") to avoid false-positiving on a
passing mention rather than the company's actual niche.
"""

from __future__ import annotations

import re

_KEYWORD_MATCH_CONFIDENCE = 0.6

# Keys match categories.key seeded by category_seed.py from Appendix A.1.
CATEGORY_NICHE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "saas": ("saas", "software as a service"),
    "enterprise-software": ("enterprise software",),
    "developer-tools": ("developer tools", "developer platform", "developer experience"),
    "cloud": ("cloud platform", "cloud computing", "cloud infrastructure", "cloud provider"),
    "devops": ("devops", "ci/cd", "continuous integration", "continuous delivery"),
    "data-platforms": ("data platform", "data warehouse", "data pipeline", "data infrastructure"),
    "fintech": ("fintech", "financial technology"),
    "payments": (
        "payments platform",
        "payment processing",
        "payments company",
        "payment gateway",
    ),
    "banking-technology": ("banking technology", "core banking", "neobank"),
    "insurtech": ("insurtech", "insurance technology"),
    "mining-tech": ("mining technology", "mining tech"),
    "agritech": ("agritech", "agricultural technology", "agtech"),
    "construction-tech": ("construction technology", "construction tech", "contech"),
    "proptech": ("proptech", "property technology", "real estate technology"),
    "logistics-tech": (
        "logistics technology",
        "logistics platform",
        "logistics execution",
        "supply chain technology",
        "freight technology",
    ),
    "govtech": ("govtech", "government technology", "public sector technology"),
    "edtech": ("edtech", "education technology"),
    "healthtech": ("healthtech", "health technology", "digital health", "healthcare technology"),
    "climate-tech": ("climate tech", "climate technology", "cleantech", "clean technology"),
    "ai-ml": ("artificial intelligence", "machine learning", "ai platform", "ai company"),
    "cybersecurity": ("cybersecurity", "cyber security", "infosec"),
    "robotics": ("robotics", "robotic"),
    "space": ("space technology", "aerospace", "satellite"),
    "defence-tech": (
        "defence technology",
        "defense technology",
        "defence tech",
        "military technology",
    ),
    "iot": ("internet of things", "iot platform", "sensor platform", "connected devices"),
    "ecommerce": ("e-commerce", "ecommerce", "online retail"),
    "marketplace": ("marketplace platform", "two-sided marketplace", "online marketplace"),
    "gaming": ("video game", "game studio", "game development", "gaming platform"),
    "media-technology": ("media technology", "streaming platform", "digital media platform"),
    "technology-consulting": ("technology consulting", "it consulting", "digital consultancy"),
    "managed-services": ("managed services", "managed it services"),
    "systems-integration": ("systems integration", "system integrator"),
}


def _matches_any_keyword(text: str, keywords: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{re.escape(keyword)}\b", text, re.IGNORECASE) for keyword in keywords)


def classify_company_niches(reason: str) -> list[tuple[str, float]]:
    return [
        (niche_key, _KEYWORD_MATCH_CONFIDENCE)
        for niche_key, keywords in CATEGORY_NICHE_KEYWORDS.items()
        if _matches_any_keyword(reason, keywords)
    ]
