"""Mapbox Geocoding API v6 forward geocoding (Phase 3 gap-fill).

The alpha seed cohort's address research has real street addresses but no
coordinates, and Phase 2's own G-NAF/ASGS pipeline has no real reference
data loaded yet to resolve them with. Mapbox is already this project's
chosen map provider (ARCHITECTURE_DECISIONS.md), so geocoding through the
same vendor avoids introducing a second one just for this one-off task.

Request/response shape verified against Mapbox's own published v6
Geocoding API docs (docs.mapbox.com/api/search/geocoding/), not assumed:
a GeoJSON FeatureCollection; each feature's point is
`geometry.coordinates` as `[longitude, latitude]`; the standardised
address string is `properties.full_address`; zero matches is an empty
`features` array with no separate error field.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

_ENDPOINT = "https://api.mapbox.com/search/geocode/v6/forward"
_TIMEOUT_SECONDS = 15


class GeocodingError(Exception):
    """Raised when a Mapbox geocoding request fails or has no match."""


@dataclass(frozen=True)
class GeocodeResult:
    longitude: float
    latitude: float
    full_address: str


def geocode_address(access_token: str, query_text: str) -> GeocodeResult:
    """Forward-geocode one free-text address, restricted to Australia so
    an ambiguous street name can't silently resolve overseas."""
    query = urlencode(
        {"q": query_text, "country": "au", "limit": 1, "access_token": access_token}
    )
    request = Request(f"{_ENDPOINT}?{query}")
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
