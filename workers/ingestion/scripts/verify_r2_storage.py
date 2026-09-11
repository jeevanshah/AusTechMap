"""Run the production-safe R2 write/read/checksum verification probe."""

from __future__ import annotations

import json

from austechmap_ingestion.storage import R2SnapshotStore, build_snapshot_store_from_env
from austechmap_ingestion.storage_verification import verify_snapshot_store


def main() -> int:
    store = build_snapshot_store_from_env()
    if not isinstance(store, R2SnapshotStore):
        raise RuntimeError("RAW_SNAPSHOT_BACKEND must resolve to the R2 snapshot store")
    result = verify_snapshot_store(store)
    print(
        json.dumps(
            {
                "byteSize": result.byte_size,
                "objectKey": result.object_key,
                "sha256": result.sha256,
                "verified": True,
            },
            separators=(",", ":"),
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
