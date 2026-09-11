from __future__ import annotations

from pathlib import Path

from austechmap_ingestion.storage import FilesystemSnapshotStore
from austechmap_ingestion.storage_verification import (
    VERIFICATION_SOURCE_KEY,
    verify_snapshot_store,
)


def test_verification_writes_and_reads_a_unique_content_addressed_object(tmp_path: Path) -> None:
    store = FilesystemSnapshotStore(tmp_path)

    result = verify_snapshot_store(store, nonce="test-nonce")

    assert result.object_key.startswith(f"raw/{VERIFICATION_SOURCE_KEY}/")
    assert result.byte_size > 0
    assert len(result.sha256) == 64
    assert store.get(object_key=result.object_key, expected_sha256=result.sha256).endswith(
        b"test-nonce\n"
    )
