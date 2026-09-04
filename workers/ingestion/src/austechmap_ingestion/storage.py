"""Immutable raw-snapshot storage abstractions."""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING, Protocol

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

SOURCE_KEY = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


class SnapshotStorageError(RuntimeError):
    """Raised when immutable snapshot storage cannot preserve the requested bytes."""


@dataclass(frozen=True)
class StoredSnapshot:
    object_key: str
    sha256: str
    byte_size: int


class SnapshotStore(Protocol):
    def put(
        self, *, source_key: str, content: bytes, content_type: str = "application/octet-stream"
    ) -> StoredSnapshot: ...


def _snapshot_identity(source_key: str, content: bytes) -> StoredSnapshot:
    if SOURCE_KEY.fullmatch(source_key) is None:
        raise ValueError("source_key must contain only lowercase letters, digits, '_' or '-'")
    digest = hashlib.sha256(content).hexdigest()
    object_key = str(PurePosixPath("raw", source_key, digest[:2], digest))
    return StoredSnapshot(object_key, digest, len(content))


class FilesystemSnapshotStore:
    """Local content-addressed store mirroring the future R2 object-key layout."""

    def __init__(self, root: Path) -> None:
        self._root = root

    def put(
        self, *, source_key: str, content: bytes, content_type: str = "application/octet-stream"
    ) -> StoredSnapshot:
        del content_type
        snapshot = _snapshot_identity(source_key, content)
        destination = self._root.joinpath(*PurePosixPath(snapshot.object_key).parts)
        destination.parent.mkdir(parents=True, exist_ok=True)

        if destination.exists():
            if destination.read_bytes() != content:
                raise SnapshotStorageError(
                    f"Content-address collision at {snapshot.object_key}"
                )
            return snapshot

        temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
        try:
            with temporary.open("xb") as file:
                file.write(content)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)

        return snapshot


@dataclass(frozen=True)
class R2Config:
    account_id: str
    access_key_id: str
    secret_access_key: str
    bucket: str

    @classmethod
    def from_env(cls, environment: Mapping[str, str] = os.environ) -> R2Config:
        names = (
            "R2_ACCOUNT_ID",
            "R2_ACCESS_KEY_ID",
            "R2_SECRET_ACCESS_KEY",
            "RAW_SNAPSHOT_BUCKET",
        )
        missing = [name for name in names if not environment.get(name)]
        if missing:
            raise ValueError(f"Missing R2 configuration: {', '.join(missing)}")
        return cls(
            account_id=environment["R2_ACCOUNT_ID"],
            access_key_id=environment["R2_ACCESS_KEY_ID"],
            secret_access_key=environment["R2_SECRET_ACCESS_KEY"],
            bucket=environment["RAW_SNAPSHOT_BUCKET"],
        )


class R2SnapshotStore:
    """Immutable content-addressed storage using R2's S3-compatible API."""

    def __init__(self, client: S3Client, bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def put(
        self, *, source_key: str, content: bytes, content_type: str = "application/octet-stream"
    ) -> StoredSnapshot:
        snapshot = _snapshot_identity(source_key, content)
        for attempt in range(2):
            try:
                self._client.put_object(
                    Bucket=self._bucket,
                    Key=snapshot.object_key,
                    Body=content,
                    ContentLength=snapshot.byte_size,
                    ContentType=content_type,
                    IfNoneMatch="*",
                    Metadata={"sha256": snapshot.sha256},
                )
                return snapshot
            except ClientError as error:
                code = str(error.response.get("Error", {}).get("Code", "unknown"))
                if code in {"PreconditionFailed", "412"}:
                    return self._verify_existing(snapshot, content)
                if code in {"ConditionalRequestConflict", "409"} and attempt == 0:
                    continue
                raise SnapshotStorageError(f"R2 put failed with code {code}") from error
            except BotoCoreError as error:
                raise SnapshotStorageError(
                    f"R2 put failed with {type(error).__name__}"
                ) from error
        raise SnapshotStorageError("R2 put failed after a conditional-write conflict")

    def _verify_existing(self, snapshot: StoredSnapshot, content: bytes) -> StoredSnapshot:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=snapshot.object_key)
            existing = response["Body"].read()
        except ClientError as error:
            code = str(error.response.get("Error", {}).get("Code", "unknown"))
            raise SnapshotStorageError(
                f"R2 could not verify existing object; get failed with code {code}"
            ) from error
        except BotoCoreError as error:
            raise SnapshotStorageError(
                f"R2 could not verify existing object; get failed with {type(error).__name__}"
            ) from error
        if existing != content:
            raise SnapshotStorageError(
                f"Content-address collision at {snapshot.object_key}"
            )
        return snapshot


def build_snapshot_store_from_env(
    environment: Mapping[str, str] = os.environ,
) -> SnapshotStore:
    backend = environment.get("RAW_SNAPSHOT_BACKEND", "filesystem").lower()
    if backend == "filesystem":
        return FilesystemSnapshotStore(
            Path(environment.get("RAW_SNAPSHOT_ROOT", ".local/raw-snapshots"))
        )
    if backend != "r2":
        raise ValueError("RAW_SNAPSHOT_BACKEND must be 'filesystem' or 'r2'")
    config = R2Config.from_env(environment)
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{config.account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=config.access_key_id,
        aws_secret_access_key=config.secret_access_key,
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )
    return R2SnapshotStore(client, config.bucket)
