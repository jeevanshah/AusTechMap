"""Shared vocabulary matching db/migrations/0006_geographic_foundation_schema.sql."""

from __future__ import annotations

from typing import Literal

RegionType = Literal["sa1", "sa2", "sa3", "sa4", "gccsa", "state", "lga", "poa", "sal"]

GeographyDataset = Literal[
    "asgs_sa1",
    "asgs_sa2",
    "asgs_sa3",
    "asgs_sa4",
    "asgs_gccsa",
    "asgs_state",
    "asgs_lga",
    "asgs_poa",
    "asgs_sal",
    "gnaf",
    "home_affairs_regional",
    "home_affairs_dama",
]

ASGS_DATASET_BY_REGION_TYPE: dict[RegionType, GeographyDataset] = {
    "sa1": "asgs_sa1",
    "sa2": "asgs_sa2",
    "sa3": "asgs_sa3",
    "sa4": "asgs_sa4",
    "gccsa": "asgs_gccsa",
    "state": "asgs_state",
    "lga": "asgs_lga",
    "poa": "asgs_poa",
    "sal": "asgs_sal",
}


class GeographyImportError(Exception):
    """Raised for malformed or inconsistent geographic source data."""
