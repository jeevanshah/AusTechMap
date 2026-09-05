from __future__ import annotations

import pytest

from austechmap_ingestion.employers.sponsorship_keywords import classify_sponsorship_mention


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("We offer visa sponsorship for the right candidate.", True),
        ("Happy to sponsor a suitable applicant for this role.", True),
        ("This role is open to subclass 482 visa holders and sponsorship.", True),
        ("Applicants must have full working rights in Australia.", False),
        ("Join our engineering team in Sydney.", False),
    ],
)
def test_classify_sponsorship_mention(text: str, expected: bool) -> None:
    assert classify_sponsorship_mention(text) is expected


@pytest.mark.parametrize(
    "text",
    [
        "Unfortunately we cannot offer visa sponsorship for this position.",
        "We are not able to sponsor a visa at this time.",
        "This role does not include visa sponsorship.",
        "We are unable to sponsor visa applicants for this role.",
    ],
)
def test_classify_sponsorship_mention_negation_guard(text: str) -> None:
    # A negation word shortly before a sponsorship phrase must cancel the
    # match -- never register a rejection as positive evidence.
    assert classify_sponsorship_mention(text) is False


def test_classify_sponsorship_mention_is_case_insensitive() -> None:
    assert classify_sponsorship_mention("VISA SPONSORSHIP AVAILABLE") is True


def test_classify_sponsorship_mention_negation_far_before_match_still_counts() -> None:
    # A negation word far enough before the match (outside the window)
    # describes something unrelated, not the sponsorship phrase itself.
    text = "No prior experience is required. We offer visa sponsorship for this role."
    assert classify_sponsorship_mention(text) is True
