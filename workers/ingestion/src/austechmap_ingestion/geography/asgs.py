"""ABS ASGS boundary-file parsing and idempotent, versioned loading.

See ARCHITECTURE_DECISIONS.md section 3.1 and IMPLEMENTATION_PLAN.md Phase 2.
"""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

import psycopg
from pyogrio.raw import read as ogr_read

from austechmap_ingestion.geography.types import (
    ASGS_DATASET_BY_REGION_TYPE,
    GeographyImportError,
    RegionType,
)
from austechmap_ingestion.jobs import JobRepository, SnapshotRecord
from austechmap_ingestion.observability import (
    ErrorReporter,
    LogContext,
    NullErrorReporter,
    PipelineMetrics,
    StructuredLogger,
)
from austechmap_ingestion.storage import SnapshotStore


@dataclass(frozen=True)
class AsgsFieldMapping:
    """Column names vary ABS release to release; callers supply the mapping
    rather than this module guessing a naming convention that may be stale."""

    code_field: str
    name_field: str
    parent_code_field: str | None = None


@dataclass(frozen=True)
class AsgsFeature:
    code: str
    name: str
    parent_code: str | None
    geometry_wkb: bytes


def parse_asgs_boundary_file(path: Path, mapping: AsgsFieldMapping) -> list[AsgsFeature]:
    """Read an ABS ASGS boundary file (Shapefile or GeoPackage) into features.

    pyogrio.raw.read returns field arrays in the *source* column order, not
    the order requested via ``columns=`` — field lookup below is by name
    (via the returned metadata), not by request-list position.
    """
    columns = [mapping.code_field, mapping.name_field]
    if mapping.parent_code_field is not None:
        columns.append(mapping.parent_code_field)
    meta, _fids, geometries, field_data = ogr_read(
        path, columns=columns, read_geometry=True, force_2d=True
    )
    if geometries is None:
        raise GeographyImportError(f"{path} has no geometry column")
    field_by_name = dict(zip(meta["fields"], field_data, strict=True))
    try:
        codes = field_by_name[mapping.code_field]
        names = field_by_name[mapping.name_field]
    except KeyError as error:
        raise GeographyImportError(f"{path} is missing expected field {error}") from error
    parents = (
        field_by_name[mapping.parent_code_field] if mapping.parent_code_field is not None else None
    )

    features: list[AsgsFeature] = []
    for index, geometry_wkb in enumerate(geometries):
        if geometry_wkb is None:
            raise GeographyImportError(f"{path} feature {index} has no geometry")
        features.append(
            AsgsFeature(
                code=str(codes[index]),
                name=str(names[index]),
                parent_code=str(parents[index]) if parents is not None else None,
                geometry_wkb=bytes(geometry_wkb),
            )
        )
    return features


@dataclass(frozen=True)
class AsgsLoadResult:
    release_id: uuid.UUID
    region_count: int
    missing_parent_count: int


def load_asgs_release(
    database_url: str,
    *,
    region_type: RegionType,
    release_version: str,
    source_id: uuid.UUID,
    import_run_id: uuid.UUID,
    effective_from: date,
    content_hash: str,
    features: list[AsgsFeature],
    parent_region_type: RegionType | None = None,
    now: datetime | None = None,
) -> AsgsLoadResult:
    """Load one ASGS level's boundaries as a new release and activate it.

    Idempotent on (dataset, release_version): a retry after a partial failure
    (e.g. the run died after regions were loaded but before the run's
    completion was recorded) reuses the existing release row instead of
    inserting a duplicate. Regions from a superseded release are never edited
    or deleted; only the active-release pointer on geography_releases moves.
    """
    if not features:
        raise GeographyImportError(f"Refusing to activate an empty {region_type} release")
    dataset = ASGS_DATASET_BY_REGION_TYPE[region_type]
    activation_time = now if now is not None else datetime.now(UTC)
    missing_parent_count = 0

    with psycopg.connect(database_url) as connection:
        existing = connection.execute(
            """
            SELECT id, row_count FROM geography_releases
            WHERE dataset = %s AND release_version = %s
            """,
            (dataset, release_version),
        ).fetchone()

        if existing is not None:
            release_id, existing_row_count = existing
            if existing_row_count != len(features):
                raise GeographyImportError(
                    f"{dataset} release {release_version} already has {existing_row_count} "
                    f"regions on record, but this attempt parsed {len(features)}"
                )
        else:
            release_row = connection.execute(
                """
                INSERT INTO geography_releases (
                  dataset, release_version, source_id, import_run_id,
                  effective_from, content_hash, row_count
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    dataset,
                    release_version,
                    source_id,
                    import_run_id,
                    effective_from,
                    content_hash,
                    len(features),
                ),
            ).fetchone()
            if release_row is None:
                raise GeographyImportError("geography_releases insert did not return an id")
            release_id = release_row[0]

            parent_lookup: dict[str, uuid.UUID] = {}
            if parent_region_type is not None:
                for row in connection.execute(
                    """
                    SELECT r.code, r.id
                    FROM regions r
                    JOIN geography_releases gr ON gr.id = r.release_id
                    WHERE gr.is_active AND r.region_type = %s
                    """,
                    (parent_region_type,),
                ):
                    parent_lookup[row[0]] = row[1]

            for feature in features:
                parent_id = None
                if feature.parent_code is not None:
                    parent_id = parent_lookup.get(feature.parent_code)
                    if parent_id is None:
                        missing_parent_count += 1
                connection.execute(
                    """
                    INSERT INTO regions (
                      release_id, region_type, code, name, parent_region_id, geom
                    )
                    VALUES (%s, %s, %s, %s, %s, ST_SetSRID(ST_Multi(ST_GeomFromWKB(%s)), 4326))
                    """,
                    (
                        release_id,
                        region_type,
                        feature.code,
                        feature.name,
                        parent_id,
                        feature.geometry_wkb,
                    ),
                )

        connection.execute(
            """
            UPDATE geography_releases
            SET is_active = false, effective_to = %s
            WHERE dataset = %s AND is_active AND id <> %s
            """,
            (effective_from, dataset, release_id),
        )
        connection.execute(
            "UPDATE geography_releases SET is_active = true, activated_at = %s WHERE id = %s",
            (activation_time, release_id),
        )

    return AsgsLoadResult(release_id, len(features), missing_parent_count)


@dataclass(frozen=True)
class AsgsImportResult:
    run_id: uuid.UUID
    release_id: uuid.UUID | None
    region_count: int
    missing_parent_count: int
    created: bool


def run_asgs_import(
    repository: JobRepository,
    store: SnapshotStore,
    database_url: str,
    *,
    region_type: RegionType,
    source_key: str,
    release_version: str,
    effective_from: date,
    file_path: Path,
    mapping: AsgsFieldMapping,
    parent_region_type: RegionType | None = None,
    worker_id: str = "asgs-importer",
    now: datetime | None = None,
    logger: StructuredLogger | None = None,
    error_reporter: ErrorReporter | None = None,
) -> AsgsImportResult:
    """Persist one idempotent ASGS boundary import and its audited run."""
    import_time = datetime.now(UTC) if now is None else now
    if import_time.tzinfo is None or import_time.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    started_at = time.monotonic()
    reporter = error_reporter if error_reporter is not None else NullErrorReporter()
    content = file_path.read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    dataset = ASGS_DATASET_BY_REGION_TYPE[region_type]

    source_id = repository.ensure_source(
        source_key=source_key,
        name=f"ABS ASGS: {dataset}",
        kind="government_open_data",
    )
    enqueued = repository.enqueue(
        run_type="asgs_import",
        idempotency_key=f"{dataset}:{release_version}:{digest}",
        source_id=source_id,
        payload={"dataset": dataset, "release_version": release_version, "sha256": digest},
        scheduled_for=import_time,
    )
    if not enqueued.created:
        if logger is not None:
            logger.event(
                "asgs_import_unchanged",
                context=LogContext(run_id=str(enqueued.run_id), source_id=str(source_id)),
                metrics=PipelineMetrics(fetched=1, unchanged=1),
                duration_ms=_duration_ms(started_at),
            )
        return AsgsImportResult(enqueued.run_id, None, 0, 0, False)

    claim = repository.claim_run(enqueued.run_id, worker_id=worker_id, now=import_time)
    if claim is None:
        raise RuntimeError(f"New ASGS import run could not be claimed: {enqueued.run_id}")
    context = LogContext(
        run_id=str(claim.run_id),
        source_id=str(source_id),
        parser_version="asgs-v1",
        correlation_id=claim.log_correlation_id,
    )
    if logger is not None:
        logger.event("asgs_import_started", context=context)
    try:
        features = parse_asgs_boundary_file(file_path, mapping)
        load_result = load_asgs_release(
            database_url,
            region_type=region_type,
            release_version=release_version,
            source_id=source_id,
            import_run_id=claim.run_id,
            effective_from=effective_from,
            content_hash=digest,
            features=features,
            parent_region_type=parent_region_type,
            now=import_time,
        )
        stored = store.put(
            source_key=source_key, content=content, content_type="application/geopackage+sqlite3"
        )
        repository.complete_with_snapshot(
            claim,
            SnapshotRecord(
                source_id=source_id,
                object_key=stored.object_key,
                sha256=stored.sha256,
                content_type="application/geopackage+sqlite3",
                byte_size=stored.byte_size,
                retrieved_at=import_time,
                response_metadata={
                    "importer": "asgs",
                    "version": 1,
                    "dataset": dataset,
                    "release_version": release_version,
                    "region_count": load_result.region_count,
                    "missing_parent_count": load_result.missing_parent_count,
                },
            ),
            metrics={
                "regions_loaded": load_result.region_count,
                "missing_parent_count": load_result.missing_parent_count,
            },
            now=import_time,
        )
    except Exception as error:
        try:
            repository.fail(
                claim,
                retryable=True,
                error_code=type(error).__name__,
                error_message=str(error),
                jitter_fraction=0,
                now=import_time,
            )
        except Exception as finalization_error:
            if logger is not None:
                logger.event(
                    "asgs_import_failure_recording_failed",
                    context=context,
                    error_code=type(finalization_error).__name__,
                    level=logging.ERROR,
                )
            reporter.capture_exception(finalization_error, context=context)
        if logger is not None:
            logger.event(
                "asgs_import_failed",
                context=context,
                metrics=PipelineMetrics(fetched=1, failed=1),
                duration_ms=_duration_ms(started_at),
                error_code=type(error).__name__,
                level=logging.ERROR,
            )
        reporter.capture_exception(error, context=context)
        raise
    if logger is not None:
        logger.event(
            "asgs_import_succeeded",
            context=context,
            metrics=PipelineMetrics(
                fetched=1,
                parsed=load_result.region_count,
                created=load_result.region_count,
                quarantined=load_result.missing_parent_count,
            ),
            duration_ms=_duration_ms(started_at),
        )
    return AsgsImportResult(
        enqueued.run_id,
        load_result.release_id,
        load_result.region_count,
        load_result.missing_parent_count,
        True,
    )


def _duration_ms(started_at: float) -> int:
    return max(0, round((time.monotonic() - started_at) * 1000))
