"""A bounded proof that a configured snapshot store preserves bytes immutably."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from austechmap_ingestion.storage import SnapshotStore

VERIFICATION_SOURCE_KEY = "r2_verification"


@dataclass(frozen=True)
class SnapshotStoreVerification:
    object_key: str
    sha256: str
    byte_size: int


def verify_snapshot_store(
    store: SnapshotStore, *, nonce: str | None = None
) -> SnapshotStoreVerification:
    """Write and read one unique, content-addressed verification object."""
    verification_nonce = nonce or uuid.uuid4().hex
    content = f"AusTechMap immutable snapshot verification:{verification_nonce}\n".encode()
    stored = store.put(
        source_key=VERIFICATION_SOURCE_KEY,
        content=content,
        content_type="text/plain; charset=utf-8",
    )
    recovered = store.get(object_key=stored.object_key, expected_sha256=stored.sha256)
    if recovered != content:
        raise RuntimeError("snapshot store returned bytes different from its verification object")
    return SnapshotStoreVerification(
        object_key=stored.object_key,
        sha256=stored.sha256,
        byte_size=stored.byte_size,
    )
