"""ABN, ACN, domain, URL, and company-name normalisation (Phase 3).

ABN and ACN validation follow the official published algorithms, verified
against their government-published worked examples during development, not
assumed from memory:

- ABN: https://abr.business.gov.au/Help/AbnFormat (modulus 89; worked
  example 51 824 753 556 is a real, valid ABN used in this module's tests).
- ACN: a modulus-10 weighted check digit (weights 8..1 on the first eight
  digits); worked example 004 085 616 cross-checked by hand.

Company-name normalisation is for matching, not display — it is lossy and
deliberately not reversible.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit, urlunsplit

_ABN_WEIGHTS = (10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19)
_ACN_WEIGHTS = (8, 7, 6, 5, 4, 3, 2, 1)

_LEGAL_SUFFIX_TOKEN_SEQUENCES: tuple[tuple[str, ...], ...] = (
    ("PROPRIETARY", "LIMITED"),
    ("PROPRIETARY", "LTD"),
    ("PTY", "LIMITED"),
    ("PTY", "LTD"),
    ("LIMITED",),
    ("LTD",),
    ("INCORPORATED",),
    ("INCORPORATED", "ASSOCIATION"),
    ("INC",),
    ("LLC",),
    ("LLP",),
)


def _digits_only(raw: str) -> str:
    return re.sub(r"\D", "", raw)


def normalise_abn(raw: str) -> str | None:
    """Return the canonical 11-digit ABN if raw is a structurally valid,
    checksum-valid ABN, else None."""
    digits = _digits_only(raw)
    if len(digits) != 11:
        return None
    adjusted = [int(digits[0]) - 1, *(int(d) for d in digits[1:])]
    if adjusted[0] < 0:
        return None
    total = sum(digit * weight for digit, weight in zip(adjusted, _ABN_WEIGHTS, strict=True))
    return digits if total % 89 == 0 else None


def normalise_acn(raw: str) -> str | None:
    """Return the canonical 9-digit ACN if raw is a structurally valid,
    checksum-valid ACN, else None."""
    digits = _digits_only(raw)
    if len(digits) != 9:
        return None
    body, check_digit = digits[:8], int(digits[8])
    total = sum(int(digit) * weight for digit, weight in zip(body, _ACN_WEIGHTS, strict=True))
    expected = (10 - (total % 10)) % 10
    return digits if expected == check_digit else None


def normalise_domain(raw: str) -> str | None:
    """Return a bare, lowercase host (no scheme/path/port/www.) for
    domain-based matching, or None if raw has no discernible host."""
    text = raw.strip().lower()
    if not text:
        return None
    if "://" not in text:
        text = f"//{text}"
    parsed = urlsplit(text)
    host = parsed.netloc or parsed.path.split("/")[0]
    host = host.split(":")[0].rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    if not host or "." not in host:
        return None
    return host


def normalise_url(raw: str) -> str | None:
    """Return a canonical https URL (lowercase host, no trailing slash,
    query/fragment dropped) for storage, or None if raw has no host."""
    text = raw.strip()
    if not text:
        return None
    if "://" not in text:
        text = f"https://{text}"
    parsed = urlsplit(text)
    if not parsed.netloc:
        return None
    scheme = "https" if parsed.scheme in ("http", "https") else parsed.scheme
    path = parsed.path.rstrip("/")
    return urlunsplit((scheme, parsed.netloc.lower(), path, "", ""))


def normalise_company_name(raw: str) -> str:
    """Canonicalise a company name for deterministic matching, not display:
    uppercase, expand '&' to 'AND', strip punctuation, and remove one
    trailing Australian legal-entity suffix."""
    text = raw.upper().replace("&", " AND ")
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    tokens = text.split()
    for suffix in _LEGAL_SUFFIX_TOKEN_SEQUENCES:
        if len(tokens) > len(suffix) and tuple(tokens[-len(suffix) :]) == suffix:
            tokens = tokens[: -len(suffix)]
            break
    return " ".join(tokens)
