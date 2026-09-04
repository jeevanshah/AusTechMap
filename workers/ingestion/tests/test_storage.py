from __future__ import annotations

from io import BytesIO
from typing import Any, cast

import boto3
import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from mypy_boto3_s3 import S3Client

from austechmap_ingestion.storage import (
    FilesystemSnapshotStore,
    R2Config,
    R2SnapshotStore,
    SnapshotStorageError,
    build_snapshot_store_from_env,
)


def _client_error(code: str, operation: str = "PutObject") -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "test"}}, operation)


class FakeS3Client:
    def __init__(
        self,
        *,
        put_errors: list[Exception] | None = None,
        existing: bytes = b"",
        get_error: ClientError | None = None,
    ) -> None:
        self.put_errors = list(put_errors or [])
        self.existing = existing
        self.get_error = get_error
        self.put_calls: list[dict[str, Any]] = []

    def put_object(self, **kwargs: Any) -> dict[str, Any]:
        self.put_calls.append(kwargs)
        if self.put_errors:
            raise self.put_errors.pop(0)
        return {}

    def get_object(self, **kwargs: Any) -> dict[str, Any]:
        del kwargs
        if self.get_error is not None:
            raise self.get_error
        return {"Body": BytesIO(self.existing)}


def _store(client: FakeS3Client) -> R2SnapshotStore:
    return R2SnapshotStore(cast(S3Client, client), "raw-bucket")


def test_r2_store_creates_immutable_content_addressed_object() -> None:
    client = FakeS3Client()
    content = b'{"ok":true}'

    stored = _store(client).put(
        source_key="sample-source", content=content, content_type="application/json"
    )

    request = client.put_calls[0]
    assert request["Bucket"] == "raw-bucket"
    assert request["Key"] == stored.object_key
    assert request["Body"] == content
    assert request["IfNoneMatch"] == "*"
    assert request["Metadata"] == {"sha256": stored.sha256}
    assert request["ContentType"] == "application/json"


def test_r2_store_treats_identical_precondition_failure_as_idempotent() -> None:
    content = b"same"
    client = FakeS3Client(put_errors=[_client_error("PreconditionFailed")], existing=content)

    stored = _store(client).put(source_key="sample-source", content=content)

    assert stored.byte_size == len(content)


def test_r2_store_rejects_content_address_collision() -> None:
    client = FakeS3Client(
        put_errors=[_client_error("412")],
        existing=b"different",
    )

    with pytest.raises(SnapshotStorageError, match="collision"):
        _store(client).put(source_key="sample-source", content=b"expected")


def test_r2_store_retries_one_conditional_conflict() -> None:
    client = FakeS3Client(put_errors=[_client_error("409")])

    _store(client).put(source_key="sample-source", content=b"content")

    assert len(client.put_calls) == 2


def test_r2_store_wraps_provider_error_without_exposing_message() -> None:
    client = FakeS3Client(put_errors=[_client_error("AccessDenied")])

    with pytest.raises(SnapshotStorageError, match="AccessDenied") as raised:
        _store(client).put(source_key="sample-source", content=b"private")

    assert "private" not in str(raised.value)


def test_r2_store_wraps_transport_error() -> None:
    client = FakeS3Client(
        put_errors=[EndpointConnectionError(endpoint_url="https://private.invalid")]
    )

    with pytest.raises(SnapshotStorageError, match="EndpointConnectionError"):
        _store(client).put(source_key="sample-source", content=b"private")


def test_storage_factory_defaults_to_filesystem() -> None:
    store = build_snapshot_store_from_env({"RAW_SNAPSHOT_ROOT": ".local/test-snapshots"})
    assert isinstance(store, FilesystemSnapshotStore)


def test_r2_config_reports_all_missing_server_side_values() -> None:
    with pytest.raises(ValueError, match="R2_ACCOUNT_ID.*R2_ACCESS_KEY_ID"):
        R2Config.from_env({"RAW_SNAPSHOT_BACKEND": "r2"})


def test_storage_factory_builds_r2_client_with_account_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeS3Client()
    called: dict[str, Any] = {}

    def build_client(service_name: str, **kwargs: Any) -> FakeS3Client:
        called["service_name"] = service_name
        called.update(kwargs)
        return client

    monkeypatch.setattr(boto3, "client", build_client)
    store = build_snapshot_store_from_env(
        {
            "RAW_SNAPSHOT_BACKEND": "r2",
            "RAW_SNAPSHOT_BUCKET": "private-raw",
            "R2_ACCOUNT_ID": "account-id",
            "R2_ACCESS_KEY_ID": "access-key",
            "R2_SECRET_ACCESS_KEY": "secret-key",
        }
    )

    assert isinstance(store, R2SnapshotStore)
    assert called["service_name"] == "s3"
    assert called["endpoint_url"] == "https://account-id.r2.cloudflarestorage.com"
    assert called["region_name"] == "auto"
    assert called["aws_access_key_id"] == "access-key"
    assert called["aws_secret_access_key"] == "secret-key"


def test_storage_factory_rejects_unknown_backend() -> None:
    with pytest.raises(ValueError, match="filesystem.*r2"):
        build_snapshot_store_from_env({"RAW_SNAPSHOT_BACKEND": "other"})
