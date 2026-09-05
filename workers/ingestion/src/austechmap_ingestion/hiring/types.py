"""Shared types for the hiring-intelligence pipeline (Phase 5). One
RawJobPosting shape carries both ATS adapters' output into the shared
normalise/match/persist steps, so those steps don't need to know which
provider a posting came from."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class RawJobPosting:
    external_id: str
    title: str
    department: str | None
    team: str | None
    location_text: str | None
    employment_type_raw: str | None
    remote_type_raw: str | None
    country: str | None
    posted_at: datetime | None
    source_url: str
    apply_url: str | None
    description_html: str | None
    description_text: str | None
    raw: dict[str, Any] = field(default_factory=dict)
