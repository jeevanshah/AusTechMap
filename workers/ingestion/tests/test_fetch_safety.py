from __future__ import annotations

import socket
from typing import Any
from unittest.mock import patch

import pytest

from austechmap_ingestion.fetch_safety import (
    DisallowedHostError,
    DisallowedSchemeError,
    DnsResolutionError,
    ResponseTooLargeError,
    TooManyRedirectsError,
    UnsafeAddressError,
    resolve_validated_addresses,
    safe_fetch,
)

_SAFE_PUBLIC_IP = "93.184.216.34"


def _getaddrinfo_returning(*ips: str) -> Any:
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443)) for ip in ips]


class _FakeResponse:
    def __init__(self, status: int, body: bytes, headers: dict[str, str] | None = None) -> None:
        self.status = status
        self._remaining = body
        self._headers = headers or {}

    def getheader(self, name: str, default: str | None = None) -> str | None:
        return self._headers.get(name, default)

    def read(self, size: int) -> bytes:
        chunk, self._remaining = self._remaining[:size], self._remaining[size:]
        return chunk


class _FakeConnection:
    def __init__(self, response: _FakeResponse) -> None:
        self._response = response
        self.closed = False

    def putrequest(self, *args: object, **kwargs: object) -> None:
        pass

    def putheader(self, *args: object, **kwargs: object) -> None:
        pass

    def endheaders(self, *args: object, **kwargs: object) -> None:
        pass

    def getresponse(self) -> _FakeResponse:
        return self._response

    def close(self) -> None:
        self.closed = True


def _patched_connections(*responses: _FakeResponse) -> Any:
    connections = iter(_FakeConnection(response) for response in responses)
    return patch(
        "austechmap_ingestion.fetch_safety._PinnedHTTPConnection",
        side_effect=lambda *a, **kw: next(connections),
    )


# --- Vector 1: loopback ---


def test_resolve_validated_addresses_rejects_ipv4_loopback() -> None:
    with (
        patch("socket.getaddrinfo", return_value=_getaddrinfo_returning("127.0.0.1")),
        pytest.raises(UnsafeAddressError),
    ):
        resolve_validated_addresses("example.test", 80)


def test_resolve_validated_addresses_rejects_ipv6_loopback() -> None:
    with (
        patch("socket.getaddrinfo", return_value=_getaddrinfo_returning("::1")),
        pytest.raises(UnsafeAddressError),
    ):
        resolve_validated_addresses("example.test", 80)


# --- Vector 2: RFC1918 private ranges ---


@pytest.mark.parametrize("private_ip", ["10.0.0.1", "172.16.0.5", "192.168.1.1"])
def test_resolve_validated_addresses_rejects_rfc1918_private_ranges(private_ip: str) -> None:
    with (
        patch("socket.getaddrinfo", return_value=_getaddrinfo_returning(private_ip)),
        pytest.raises(UnsafeAddressError),
    ):
        resolve_validated_addresses("example.test", 80)


# --- Vector 3: link-local, including cloud metadata ---


def test_resolve_validated_addresses_rejects_cloud_metadata_address() -> None:
    with (
        patch("socket.getaddrinfo", return_value=_getaddrinfo_returning("169.254.169.254")),
        pytest.raises(UnsafeAddressError),
    ):
        resolve_validated_addresses("example.test", 80)


# --- Vector 4: unspecified / multicast ---


@pytest.mark.parametrize("address", ["0.0.0.0", "224.0.0.1"])
def test_resolve_validated_addresses_rejects_unspecified_and_multicast(address: str) -> None:
    with (
        patch("socket.getaddrinfo", return_value=_getaddrinfo_returning(address)),
        pytest.raises(UnsafeAddressError),
    ):
        resolve_validated_addresses("example.test", 80)


# --- Vector 5: IPv4-mapped IPv6 bypass ---


def test_resolve_validated_addresses_rejects_ipv4_mapped_ipv6_loopback() -> None:
    with (
        patch("socket.getaddrinfo", return_value=_getaddrinfo_returning("::ffff:127.0.0.1")),
        pytest.raises(UnsafeAddressError),
    ):
        resolve_validated_addresses("example.test", 80)


# --- Vector 6: a hostname mocked to resolve to a private IP, exercised through safe_fetch ---


def test_safe_fetch_rejects_a_hostname_resolving_to_a_private_ip() -> None:
    with (
        patch("socket.getaddrinfo", return_value=_getaddrinfo_returning("10.0.0.5")),
        pytest.raises(UnsafeAddressError),
    ):
        safe_fetch(
            "http://internal.example.test/jobs",
            allowed_hosts=frozenset({"internal.example.test"}),
        )


# --- Vector 7: a redirect chain whose final hop resolves to a private IP ---


def test_safe_fetch_rejects_a_redirect_to_a_private_address() -> None:
    def fake_getaddrinfo(hostname: str, *args: object, **kwargs: object) -> Any:
        if hostname == "safe.example.test":
            return _getaddrinfo_returning(_SAFE_PUBLIC_IP)
        return _getaddrinfo_returning("10.0.0.5")

    redirect_response = _FakeResponse(
        302, b"", {"Location": "http://internal.example.test/jobs"}
    )
    with (
        patch("socket.getaddrinfo", side_effect=fake_getaddrinfo),
        _patched_connections(redirect_response),
        pytest.raises(UnsafeAddressError),
    ):
        safe_fetch(
            "http://safe.example.test/jobs",
            allowed_hosts=frozenset({"safe.example.test", "internal.example.test"}),
        )


# --- Vector 8: exceeding max_redirects ---


def test_safe_fetch_raises_after_too_many_redirects() -> None:
    responses = [
        _FakeResponse(302, b"", {"Location": "http://safe.example.test/next"}) for _ in range(3)
    ]
    with (
        patch("socket.getaddrinfo", return_value=_getaddrinfo_returning(_SAFE_PUBLIC_IP)),
        _patched_connections(*responses),
        pytest.raises(TooManyRedirectsError),
    ):
        safe_fetch(
            "http://safe.example.test/jobs",
            allowed_hosts=frozenset({"safe.example.test"}),
            max_redirects=2,
        )


# --- Vector 9: non-http(s) scheme ---


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://example.test/jobs"])
def test_safe_fetch_rejects_non_http_schemes(url: str) -> None:
    with pytest.raises(DisallowedSchemeError):
        safe_fetch(url, allowed_hosts=frozenset({"example.test"}))


# --- Vector 10: host outside the allowlist ---


def test_safe_fetch_rejects_a_host_outside_the_allowlist() -> None:
    with pytest.raises(DisallowedHostError):
        safe_fetch("http://not-allowed.test/jobs", allowed_hosts=frozenset({"safe.example.test"}))


# --- Vector 11: oversized response aborted mid-stream ---


def test_safe_fetch_aborts_an_oversized_response() -> None:
    response = _FakeResponse(200, b"x" * 1000, {"Content-Type": "application/json"})
    with (
        patch("socket.getaddrinfo", return_value=_getaddrinfo_returning(_SAFE_PUBLIC_IP)),
        _patched_connections(response),
        pytest.raises(ResponseTooLargeError),
    ):
        safe_fetch(
            "http://safe.example.test/jobs",
            allowed_hosts=frozenset({"safe.example.test"}),
            max_response_bytes=10,
        )


# --- Vector 12: DNS resolution failure ---


def test_resolve_validated_addresses_raises_for_dns_failure() -> None:
    with (
        patch("socket.getaddrinfo", side_effect=OSError("name resolution failed")),
        pytest.raises(DnsResolutionError),
    ):
        resolve_validated_addresses("nonexistent.example.test", 80)


# --- A successful fetch, for completeness ---


def test_safe_fetch_returns_a_successful_response() -> None:
    response = _FakeResponse(200, b'{"ok": true}', {"Content-Type": "application/json"})
    with (
        patch("socket.getaddrinfo", return_value=_getaddrinfo_returning(_SAFE_PUBLIC_IP)),
        _patched_connections(response),
    ):
        result = safe_fetch(
            "http://safe.example.test/jobs", allowed_hosts=frozenset({"safe.example.test"})
        )
    assert result.status_code == 200
    assert result.content == b'{"ok": true}'
    assert result.content_type == "application/json"
    assert result.final_url == "http://safe.example.test/jobs"
