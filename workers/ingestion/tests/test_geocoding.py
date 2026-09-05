from __future__ import annotations

import json
from collections.abc import Mapping
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

import pytest

from austechmap_ingestion.employers.geocoding import GeocodingError, geocode_address


def _fake_response(payload: Mapping[str, object]) -> MagicMock:
    response = MagicMock()
    response.read.return_value = json.dumps(payload).encode("utf-8")
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    return response


def test_geocode_address_parses_a_successful_match() -> None:
    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [151.2093, -33.8688]},
                "properties": {"full_address": "341 George St, Sydney NSW 2000, Australia"},
            }
        ],
    }
    with patch(
        "austechmap_ingestion.employers.geocoding.urlopen", return_value=_fake_response(payload)
    ):
        result = geocode_address("test-token", "341 George Street, Sydney NSW 2000, Australia")

    assert result.longitude == 151.2093
    assert result.latitude == -33.8688
    assert result.full_address == "341 George St, Sydney NSW 2000, Australia"


def test_geocode_address_raises_for_zero_matches() -> None:
    payload = {"type": "FeatureCollection", "features": []}
    with (
        patch(
            "austechmap_ingestion.employers.geocoding.urlopen",
            return_value=_fake_response(payload),
        ),
        pytest.raises(GeocodingError, match="no geocoding match"),
    ):
        geocode_address("test-token", "nonexistent place, nowhere")


def test_geocode_address_raises_for_http_error() -> None:
    error = HTTPError(url="", code=401, msg="Unauthorized", hdrs=None, fp=None)  # type: ignore[arg-type]
    with (
        patch("austechmap_ingestion.employers.geocoding.urlopen", side_effect=error),
        pytest.raises(GeocodingError, match="401"),
    ):
        geocode_address("bad-token", "341 George Street, Sydney NSW 2000, Australia")
