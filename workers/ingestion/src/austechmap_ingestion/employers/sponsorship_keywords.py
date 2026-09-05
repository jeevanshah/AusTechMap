"""Deterministic sponsorship-mention classification for job postings
(Phase 6, Track 6A). Pure functions, no DB access -- mirrors
category_classifier.py's style.

Deliberately conservative, per PRODUCT_SPEC.md §8.1's "never overclaim"
language rule: only affirmative, unambiguous phrases count as a match,
and a negation word shortly before a match cancels it out
("unfortunately we cannot offer visa sponsorship" must never register as
positive evidence). A reason/description with no match yields False,
never a guessed True -- the same "never guess" rule this project's other
classifiers document.

No real fixture example (the real recorded Lever/Ashby/Greenhouse job
postings from Phase 5) currently exercises either the positive or the
negation-guard path -- checked directly before writing this, not
assumed. This is a v1 starter keyword list, the same framing as
category_classifier.py's, not a set validated against a real positive
example yet.
"""

from __future__ import annotations

import re

_SPONSORSHIP_PHRASES: tuple[str, ...] = (
    "visa sponsorship",
    "sponsor visa",
    "sponsor a visa",
    "sponsorship available",
    "we will sponsor",
    "happy to sponsor",
    "able to sponsor",
    "visa sponsored",
    "sponsored visa",
    "subclass 482",
    "subclass 186",
    "subclass 187",
    "subclass 494",
)

_NEGATION_WORDS: tuple[str, ...] = ("not", "no", "cannot", "can't", "unable", "don't", "won't")
_NEGATION_WINDOW_WORDS = 5


def _find_matches(text: str, phrase: str) -> list[re.Match[str]]:
    pattern = rf"\b{re.escape(phrase)}\b"
    return list(re.finditer(pattern, text, re.IGNORECASE))


def _is_negated(text: str, match_start: int) -> bool:
    preceding_text = text[:match_start]
    preceding_words = re.findall(r"[A-Za-z']+", preceding_text)[-_NEGATION_WINDOW_WORDS:]
    return any(word.lower() in _NEGATION_WORDS for word in preceding_words)


def classify_sponsorship_mention(text: str) -> bool:
    """True only if some affirmative sponsorship phrase appears, and is
    not itself negated by a nearby negation word."""
    for phrase in _SPONSORSHIP_PHRASES:
        for match in _find_matches(text, phrase):
            if not _is_negated(text, match.start()):
                return True
    return False
