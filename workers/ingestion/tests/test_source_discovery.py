from __future__ import annotations

from pathlib import Path

from austechmap_ingestion.fetch_safety import SafeFetchResult
from austechmap_ingestion.hiring.source_discovery import (
    CareersFixtureRow,
    discover_ats_sources,
    extract_ats_candidates,
    load_careers_fixture,
    write_ats_discovery_preflight,
)


def test_extract_ats_candidates_accepts_only_known_public_board_links() -> None:
    candidates = extract_ats_candidates(
        """
        <a href="https://jobs.lever.co/acme">Jobs</a>
        <iframe src="https://careers.breezy.hr"></iframe>
        <a href="https://apply.workable.com/j/role-1">Individual job</a>
        <a href="https://boards.greenhouse.io/embed/job_app?for=acme">Embed</a>
        <a href="https://evil.example/jobs.lever.co/not-a-board">Ignore</a>
        <a href="/careers">Ignore</a>
        """,
        page_url="https://acme.example/careers",
        company_domain="acme.example",
        careers_url="https://acme.example/careers",
    )

    assert [(candidate.ats_provider, candidate.ats_identifier) for candidate in candidates] == [
        ("breezy", "careers"),
        ("lever", "acme"),
    ]


def test_discover_ats_sources_records_fetch_errors_without_emitting_a_candidate() -> None:
    def fake_fetch(url: str, **_: object) -> SafeFetchResult:
        if url.endswith("robots.txt"):
            return SafeFetchResult(url, 404, b"", "text/plain")
        return SafeFetchResult(
            url, 200, b'<a href="https://jobs.ashbyhq.com/acme">Jobs</a>', "text/html"
        )

    result = discover_ats_sources(
        (
            CareersFixtureRow("acme.example", "https://acme.example/careers"),
            CareersFixtureRow("bad.example", "not-a-url"),
        ),
        workers=1,
        fetcher=fake_fetch,
    )

    assert result.checked == 2
    assert [
        (candidate.ats_provider, candidate.ats_identifier) for candidate in result.candidates
    ] == [("ashby", "acme")]
    assert result.errors[0][0] == "bad.example"


def test_load_and_write_discovery_preflight(tmp_path: Path) -> None:
    fixture = tmp_path / "cohort.csv"
    fixture.write_text(
        "domain,careers_url\nacme.example,https://acme.example/careers\n",
        encoding="utf-8",
    )
    rows = load_careers_fixture(fixture)
    assert rows == (CareersFixtureRow("acme.example", "https://acme.example/careers"),)

    output = tmp_path / "preflight.csv"
    write_ats_discovery_preflight(
        output,
        discover_ats_sources(
            rows,
            workers=1,
            fetcher=lambda url, **_: SafeFetchResult(
                url,
                404 if url.endswith("robots.txt") else 200,
                b""
                if url.endswith("robots.txt")
                else b'<a href="https://apply.workable.com/acme">Jobs</a>',
                "text/plain" if url.endswith("robots.txt") else "text/html",
            ),
        ),
    )

    assert "candidate_requires_manual_live_board_verification" in output.read_text(encoding="utf-8")
