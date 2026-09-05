"""Forward geocoding for the alpha seed cohort's researched addresses
(Phase 3 gap-fill): the address research has real street addresses but
no coordinates, and Phase 2's own G-NAF/ASGS pipeline has no real
reference data loaded yet to resolve them with.

Two providers, same `GeocodeResult` shape, so `locations_seed.py` can use
either interchangeably via its `geocode_fn` parameter. Geocoding an
address is a different concern from rendering the map itself (see
ARCHITECTURE_DECISIONS.md §3.5), so this choice is independent of which
map-tile renderer the project uses:

- `geocode_address_nominatim` (OpenStreetMap's Nominatim) needs no
  signup or payment method at all, so it's the default for this task.
  Its usage policy caps public use at 1 request/second and requires a
  request be identifiable (a real User-Agent, optionally an email) --
  both honoured here with a project-identifying string, not a personal
  one, since that string is sent to a third-party service.
- `geocode_address` (Mapbox v6 Geocoding API) is available as an
  alternate provider behind the same interface, since Mapbox's own
  geocoding is generally more precise for messy real-world address text
  -- but its signup flow requires a payment method on file even for the
  free tier, so it is opt-in, not the default.

Both providers' request/response shapes were verified against their own
published docs, not assumed:

- Mapbox v6 (docs.mapbox.com/api/search/geocoding/): a GeoJSON
  FeatureCollection; each feature's point is `geometry.coordinates` as
  `[longitude, latitude]`; the standardised address string is
  `properties.full_address`; zero matches is an empty `features` array
  with no separate error field.
- Nominatim `/search` (nominatim.org/release-docs, operations.osmfoundation.org
  /policies/nominatim/): a bare JSON array of results (`format=jsonv2`
  is the default), each with string `lat`/`lon` and a `display_name`;
  zero matches is an empty array.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

_MAPBOX_ENDPOINT = "https://api.mapbox.com/search/geocode/v6/forward"
_NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_USER_AGENT = "AusTechMap-alpha-seed/0.1 (+https://github.com/jeevanshah/AusTechMap)"
_NOMINATIM_MIN_INTERVAL_SECONDS = 1.0
_TIMEOUT_SECONDS = 15


class GeocodingError(Exception):
    """Raised when a geocoding request fails or has no match."""


@dataclass(frozen=True)
class GeocodeResult:
    longitude: float
    latitude: float
    full_address: str


def geocode_address(access_token: str, query_text: str) -> GeocodeResult:
    """Forward-geocode via Mapbox, restricted to Australia so an
    ambiguous street name can't silently resolve overseas."""
    query = urlencode(
        {"q": query_text, "country": "au", "limit": 1, "access_token": access_token}
    )
    request = Request(f"{_MAPBOX_ENDPOINT}?{query}")
    try:
        with urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read())
    except HTTPError as error:
        raise GeocodingError(
            f"Mapbox geocoding request failed ({error.code}) for {query_text!r}"
        ) from error
    except URLError as error:
        raise GeocodingError(f"Mapbox geocoding request failed for {query_text!r}") from error

    features = payload.get("features", [])
    if not features:
        raise GeocodingError(f"no geocoding match for: {query_text!r}")

    feature = features[0]
    longitude, latitude = feature["geometry"]["coordinates"]
    full_address = feature.get("properties", {}).get("full_address", query_text)
    return GeocodeResult(longitude=longitude, latitude=latitude, full_address=full_address)


def geocode_address_nominatim(_unused_credential: str, query_text: str) -> GeocodeResult:
    """Forward-geocode via OpenStreetMap's Nominatim -- no signup or
    payment method required. Self-throttles to the usage policy's 1
    request/second before every call, restricted to Australia. Takes the
    same (str, str) shape as `geocode_address` so both are interchangeable
    as `locations_seed.GeocodeFn`; the first argument is unused (there is
    no credential), kept only for that interchangeability."""
    time.sleep(_NOMINATIM_MIN_INTERVAL_SECONDS)
    query = urlencode(
        {"q": query_text, "countrycodes": "au", "format": "jsonv2", "limit": 1}
    )
    request = Request(
        f"{_NOMINATIM_ENDPOINT}?{query}", headers={"User-Agent": _NOMINATIM_USER_AGENT}
    )
    try:
        with urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            results = json.loads(response.read())
    except HTTPError as error:
        raise GeocodingError(
            f"Nominatim geocoding request failed ({error.code}) for {query_text!r}"
        ) from error
    except URLError as error:
        raise GeocodingError(f"Nominatim geocoding request failed for {query_text!r}") from error

    if not results:
        raise GeocodingError(f"no geocoding match for: {query_text!r}")

    result = results[0]
    return GeocodeResult(
        longitude=float(result["lon"]),
        latitude=float(result["lat"]),
        full_address=result.get("display_name", query_text),
    )
