"""SSRF-safe HTTP fetch (Phase 5): the first module in this codebase that
makes outbound requests to third-party URLs. Two independent layers of
defence, both required, per PRODUCT_SPEC.md §12.2's crawler SSRF-protection
requirement ("resolve and validate destinations, allow only http/https,
block loopback/private/link-local ranges, control redirects, and
preferably crawl only registered source domains"):

1. A caller-supplied host allowlist (`allowed_hosts` has no default -- a
   caller can never accidentally omit it).
2. IP-range validation with connection pinning, re-run on every redirect
   hop, not just the initial URL.

No new HTTP dependency: stdlib `http.client`, matching the precedent
`employers/geocoding.py` already set for outbound fetches in this project.
Bare `urlopen()`/`http.client` usage is not enough on its own: automatic
redirect handling gives no hook to re-validate each hop's resolved
address, and even a "resolve then connect" pre-check leaves a
DNS-rebinding TOCTOU gap (a malicious DNS answer differs between the
validation lookup and the connection a moment later). Closing that
requires connecting to a specific validated IP literal rather than
letting the HTTP client re-resolve the hostname itself -- hence
`_single_request` builds the connection by hand instead of using
`urllib.request`'s opener/handler chain, which has no seam for pinning a
connection to an address distinct from the request's Host header.
"""

from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
from collections.abc import Mapping
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit, urlunsplit

ALLOWED_SCHEMES = frozenset({"http", "https"})
DEFAULT_TIMEOUT_SECONDS = 15.0
DEFAULT_MAX_REDIRECTS = 5
DEFAULT_MAX_RESPONSE_BYTES = 10_000_000
_READ_CHUNK_SIZE = 65_536
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})


class FetchSafetyError(Exception):
    """Base error for a rejected or failed safe_fetch call."""


class DisallowedSchemeError(FetchSafetyError):
    pass


class DisallowedHostError(FetchSafetyError):
    pass


class DnsResolutionError(FetchSafetyError):
    pass


class UnsafeAddressError(FetchSafetyError):
    pass


class TooManyRedirectsError(FetchSafetyError):
    pass


class ResponseTooLargeError(FetchSafetyError):
    pass


@dataclass(frozen=True)
class SafeFetchResult:
    final_url: str
    status_code: int
    content: bytes
    content_type: str


def _is_unsafe_address(raw: str) -> bool:
    address: ipaddress.IPv4Address | ipaddress.IPv6Address = ipaddress.ip_address(raw)
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        # Unwrap ::ffff:x.x.x.x before classifying, so an IPv4-mapped IPv6
        # loopback/private address can't slip past checks that only look
        # at native IPv6 ranges.
        address = address.ipv4_mapped
    return (
        address.is_loopback
        or address.is_private
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


def resolve_validated_addresses(hostname: str, port: int) -> tuple[str, ...]:
    """Resolve hostname via getaddrinfo and return the validated IP
    literals in resolution order. Raises DnsResolutionError if resolution
    fails, or UnsafeAddressError if ANY resolved address is unsafe --
    rejecting the whole hostname rather than picking a "safe-looking"
    address closes the "one public + one private A record" bypass
    regardless of which address a naive client would happen to pick."""
    try:
        results = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except OSError as error:
        raise DnsResolutionError(f"could not resolve {hostname!r}: {error}") from error

    addresses = tuple(dict.fromkeys(str(result[4][0]) for result in results))
    if not addresses:
        raise DnsResolutionError(f"no addresses returned for {hostname!r}")
    for raw in addresses:
        if _is_unsafe_address(raw):
            raise UnsafeAddressError(f"{hostname!r} resolved to unsafe address {raw!r}")
    return addresses


def _validate_url(url: str, allowed_hosts: frozenset[str]) -> tuple[str, str, int, str, str]:
    """Validate scheme + host allowlist, resolve+validate DNS, and return
    (scheme, hostname, port, path_with_query, pinned_ip) -- run for the
    initial URL and, via safe_fetch's loop, for every redirect hop too."""
    parts = urlsplit(url)
    if parts.scheme not in ALLOWED_SCHEMES:
        raise DisallowedSchemeError(f"scheme not allowed: {parts.scheme!r}")
    hostname = (parts.hostname or "").lower()
    if not hostname or hostname not in allowed_hosts:
        raise DisallowedHostError(f"host not in allowlist: {parts.hostname!r}")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    addresses = resolve_validated_addresses(hostname, port)
    path = urlunsplit(("", "", parts.path or "/", parts.query, "")) or "/"
    return parts.scheme, hostname, port, path, addresses[0]


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, pinned_ip: str, port: int, *, timeout: float) -> None:
        super().__init__(pinned_ip, port, timeout=timeout)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Connects to the validated IP literal, but sends TLS SNI and
    verifies the certificate against the real hostname -- decoupling
    "where the socket connects" from "what identity is authenticated"
    is exactly what a plain HTTPSConnection(pinned_ip, ...) can't do,
    since it always uses self.host for both."""

    def __init__(self, pinned_ip: str, real_hostname: str, port: int, *, timeout: float) -> None:
        context = ssl.create_default_context()
        super().__init__(pinned_ip, port, timeout=timeout, context=context)
        self._ssl_context = context
        self._real_hostname = real_hostname

    def connect(self) -> None:
        sock = socket.create_connection((self.host, self.port), self.timeout)
        self.sock = self._ssl_context.wrap_socket(sock, server_hostname=self._real_hostname)


def _single_request(
    url: str,
    *,
    allowed_hosts: frozenset[str],
    timeout_seconds: float,
    max_response_bytes: int,
    headers: Mapping[str, str],
) -> tuple[int, str | None, bytes, str]:
    scheme, hostname, port, path, pinned_ip = _validate_url(url, allowed_hosts)
    connection: http.client.HTTPConnection
    if scheme == "https":
        connection = _PinnedHTTPSConnection(pinned_ip, hostname, port, timeout=timeout_seconds)
    else:
        connection = _PinnedHTTPConnection(pinned_ip, port, timeout=timeout_seconds)

    try:
        connection.putrequest("GET", path, skip_host=True)
        connection.putheader("Host", hostname)
        for name, value in headers.items():
            connection.putheader(name, value)
        connection.endheaders()

        response = connection.getresponse()
        content_type = response.getheader("Content-Type", "")
        location = response.getheader("Location")

        body = bytearray()
        while True:
            chunk = response.read(_READ_CHUNK_SIZE)
            if not chunk:
                break
            body.extend(chunk)
            if len(body) > max_response_bytes:
                raise ResponseTooLargeError(
                    f"response from {url} exceeded {max_response_bytes} bytes"
                )
        return response.status, location, bytes(body), content_type
    finally:
        connection.close()


def safe_fetch(
    url: str,
    *,
    allowed_hosts: frozenset[str],
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
    max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
    headers: Mapping[str, str] | None = None,
) -> SafeFetchResult:
    """GET url, following up to max_redirects redirects. Every hop
    (including the first) is independently scheme/host-allowlist/DNS/IP
    validated -- a redirect to a disallowed host or an address that
    resolves to a private range is rejected exactly like the initial URL
    would be, not trusted because the first hop passed."""
    request_headers = dict(headers or {})
    current_url = url
    for _ in range(max_redirects + 1):
        status, location, body, content_type = _single_request(
            current_url,
            allowed_hosts=allowed_hosts,
            timeout_seconds=timeout_seconds,
            max_response_bytes=max_response_bytes,
            headers=request_headers,
        )
        if status in _REDIRECT_STATUSES:
            if not location:
                raise FetchSafetyError(f"redirect from {current_url} had no Location header")
            current_url = urljoin(current_url, location)
            continue
        return SafeFetchResult(
            final_url=current_url, status_code=status, content=body, content_type=content_type
        )
    raise TooManyRedirectsError(f"exceeded {max_redirects} redirects starting from {url}")
