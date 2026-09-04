from __future__ import annotations

import pytest

from austechmap_ingestion.employers.normalisation import (
    normalise_abn,
    normalise_acn,
    normalise_company_name,
    normalise_domain,
    normalise_url,
)

# A real, valid ABN from the official worked example at
# https://abr.business.gov.au/Help/AbnFormat
VALID_ABN = "51824753556"
# A real, valid ACN cross-checked by hand against the algorithm.
VALID_ACN = "004085616"


@pytest.mark.parametrize(
    "formatted",
    [VALID_ABN, "51 824 753 556", "51-824-753-556"],
)
def test_normalise_abn_accepts_valid_abn_in_any_formatting(formatted: str) -> None:
    assert normalise_abn(formatted) == VALID_ABN


def test_normalise_abn_rejects_bad_checksum() -> None:
    assert normalise_abn("51824753557") is None


def test_normalise_abn_rejects_wrong_length() -> None:
    assert normalise_abn("123") is None
    assert normalise_abn("123456789012") is None


def test_normalise_abn_rejects_a_zero_first_digit() -> None:
    # Subtracting 1 from a leading 0 would go negative, which isn't a
    # meaningful digit for the checksum — reject outright rather than wrap.
    assert normalise_abn("00000000000") is None


@pytest.mark.parametrize("formatted", [VALID_ACN, "004 085 616", "004-085-616"])
def test_normalise_acn_accepts_valid_acn_in_any_formatting(formatted: str) -> None:
    assert normalise_acn(formatted) == VALID_ACN


def test_normalise_acn_rejects_bad_check_digit() -> None:
    assert normalise_acn("004085617") is None


def test_normalise_acn_rejects_wrong_length() -> None:
    assert normalise_acn("123") is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://www.Example.com.au/careers", "example.com.au"),
        ("http://example.com/", "example.com"),
        ("EXAMPLE.COM.AU", "example.com.au"),
        ("www.example.com", "example.com"),
        ("example.com:8080/path", "example.com"),
    ],
)
def test_normalise_domain(raw: str, expected: str) -> None:
    assert normalise_domain(raw) == expected


@pytest.mark.parametrize("raw", ["", "not a domain", "http://"])
def test_normalise_domain_rejects_hostless_input(raw: str) -> None:
    assert normalise_domain(raw) is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("example.com/careers/", "https://example.com/careers"),
        ("HTTP://Example.COM", "https://example.com"),
        ("https://example.com/careers?utm=1", "https://example.com/careers"),
    ],
)
def test_normalise_url(raw: str, expected: str) -> None:
    assert normalise_url(raw) == expected


def test_normalise_url_rejects_hostless_input() -> None:
    assert normalise_url("") is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Acme Pty Ltd", "ACME"),
        ("ACME PTY. LTD.", "ACME"),
        ("Acme Proprietary Limited", "ACME"),
        ("Acme Limited", "ACME"),
        ("Acme & Co Pty Ltd", "ACME AND CO"),
        ("Acme Technologies Inc", "ACME TECHNOLOGIES"),
        ("Acme", "ACME"),
    ],
)
def test_normalise_company_name(raw: str, expected: str) -> None:
    assert normalise_company_name(raw) == expected


def test_normalise_company_name_does_not_strip_a_bare_legal_word() -> None:
    # A company literally named "Limited" (or similar) shouldn't be
    # normalised down to an empty string.
    assert normalise_company_name("Limited") == "LIMITED"
