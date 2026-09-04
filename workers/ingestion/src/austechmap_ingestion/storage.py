"""Immutable raw-snapshot storage abstractions."""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Protocol

SOURCE_KEY = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


class SnapshotStorageError(RuntimeError):
    """Raised when immutable snapshot storage cannot preserve the requested bytes."""


@dataclass(frozen=True)
class StoredSnapshot:
    object_key: str
    sha256: str
    byte_size: int


class SnapshotStore(Protocol):
    def put(self, *, source_key: str, content: bytes) -> StoredSnapshot: ...


class FilesystemSnapshotStore:
    """Local content-addressed store mirroring the future R2 object-key layout."""

    def __init__(self, root: Path) -> None:
        self._root = root

    def put(self, *, source_key: str, content: bytes) -> StoredSnapshot:
        if SOURCE_KEY.fullmatch(source_key) is None:
            raise ValueError("source_key must contain only lowercase letters, digits, '_' or '-'")
        digest = hashlib.sha256(content).hexdigest()
        object_key = str(PurePosixPath("raw", source_key, digest[:2], digest))
        destination = self._root.joinpath(*PurePosixPath(object_key).parts)
        destination.parent.mkdir(parents=True, exist_ok=True)

        if destination.exists():
            if destination.read_bytes() != content:
                raise SnapshotStorageError(f"Content-address collision at {object_key}")
            return StoredSnapshot(object_key, digest, len(content))

        temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
        try:
            with temporary.open("xb") as file:
                file.write(content)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)

        return StoredSnapshot(object_key, digest, len(content))
