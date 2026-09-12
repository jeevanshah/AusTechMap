"""Retention engine: alert evaluation and notification dispatch (Phase 7)."""

from austechmap_ingestion.retention.dispatch_alerts import (
    AlertDispatchStats,
    dispatch_alerts,
)

__all__ = ["AlertDispatchStats", "dispatch_alerts"]
