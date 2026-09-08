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
OBJECT_KEY = re.compile(
    r"^raw/[a-z0-9][a-z0-9_-]*/(?P<prefix>[0-9a-f]{2})/(?P<digest>[0-9a-f]{64})$"
)


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

    def get(self, *, object_key: str, expected_sha256: str) -> bytes: ...


def _snapshot_identity(source_key: str, content: bytes) -> StoredSnapshot:
    if SOURCE_KEY.fullmatch(source_key) is None:
        raise ValueError("source_key must contain only lowercase letters, digits, '_' or '-'")
    digest = hashlib.sha256(content).hexdigest()
    object_key = str(PurePosixPath("raw", source_key, digest[:2], digest))
    return StoredSnapshot(object_key, digest, len(content))


def _validated_snapshot_digest(object_key: str, expected_sha256: str) -> str:
    match = OBJECT_KEY.fullmatch(object_key)
    if match is None:
        raise ValueError("object_key is not a valid content-addressed snapshot path")
    digest = match.group("digest")
    if match.group("prefix") != digest[:2] or digest != expected_sha256:
        raise SnapshotStorageError("Snapshot object key does not match its expected checksum")
    return digest


def _verify_snapshot_content(content: bytes, expected_sha256: str) -> bytes:
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        raise SnapshotStorageError("Snapshot content checksum does not match metadata")
    return content


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

    def get(self, *, object_key: str, expected_sha256: str) -> bytes:
        _validated_snapshot_digest(object_key, expected_sha256)
        source = self._root.joinpath(*PurePosixPath(object_key).parts)
        try:
            content = source.read_bytes()
        except OSError as error:
            raise SnapshotStorageError(f"Could not read snapshot {object_key}") from error
        return _verify_snapshot_content(content, expected_sha256)


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

    def get(self, *, object_key: str, expected_sha256: str) -> bytes:
        _validated_snapshot_digest(object_key, expected_sha256)
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=object_key)
            content = response["Body"].read()
        except ClientError as error:
            code = str(error.response.get("Error", {}).get("Code", "unknown"))
            raise SnapshotStorageError(f"R2 get failed with code {code}") from error
        except BotoCoreError as error:
            raise SnapshotStorageError(
                f"R2 get failed with {type(error).__name__}"
            ) from error
        return _verify_snapshot_content(content, expected_sha256)


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
