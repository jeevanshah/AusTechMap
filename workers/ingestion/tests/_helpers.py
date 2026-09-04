"""Shared test-support utilities. Not a test module itself — the leading
underscore keeps pytest from trying to collect it as one."""

from __future__ import annotations

from austechmap_ingestion.employers.normalisation import normalise_abn


def unique_valid_abn(seed: str) -> str:
    """A real, checksum-valid ABN deterministically derived from seed, so
    two tests using different seeds (e.g. their own uuid4().hex) never
    claim the same ABN in the shared test database. companies.abn has a
    global unique index while not merged (migration 0007), and ABNs carry
    a real checksum, so tests can't just append a random suffix to some
    shared literal the way they can for slugs — a hardcoded literal ABN
    reused across tests/files is exactly what caused a real cross-test
    collision once already."""
    # Kept above 10_000_000_000 so the leading digit is never '0' — normalise_abn
    # structurally rejects that (subtracting 1 from it would go negative),
    # which silently made every candidate in a smaller range fail.
    start = 10_000_000_000 + (int(seed[:8], 16) % 89_999_000_000)
    for offset in range(1000):
        candidate = f"{start + offset:011d}"
        result = normalise_abn(candidate)
        if result is not None:
            return result
    raise RuntimeError(f"could not derive a valid ABN near seed {seed!r}")
