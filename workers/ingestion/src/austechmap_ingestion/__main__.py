import argparse
import json
import os
import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime
from pathlib import Path

import psycopg

from austechmap_ingestion.db.migrations import MigrationError, apply_migrations
from austechmap_ingestion.employers.category_apply import apply_company_categories
from austechmap_ingestion.employers.category_seed import seed_categories
from austechmap_ingestion.employers.geocoding import (
    GeocodingError,
    geocode_address,
    geocode_address_nominatim,
)
from austechmap_ingestion.employers.labour_agreements import (
    LabourAgreementError,
    load_labour_agreements_fixture,
    match_labour_agreements,
)
from austechmap_ingestion.employers.location_quality import (
    LocationQualityError,
    quarantine_low_specificity_locations,
)
from austechmap_ingestion.employers.locations_seed import (
    DEFAULT_FIXTURE_PATH as DEFAULT_ADDRESS_FIXTURE_PATH,
)
from austechmap_ingestion.employers.locations_seed import (
    LocationSeedError,
    run_location_seed_import,
)
from austechmap_ingestion.employers.seed import (
    DEFAULT_FIXTURE_PATH,
    SeedImportError,
    run_seed_import,
)
from austechmap_ingestion.employers.sponsorship_evidence import (
    derive_sponsorship_evidence_from_jobs,
)
from austechmap_ingestion.health import build_health
from austechmap_ingestion.hiring.ats_source_seed import AtsSourceSeedError, seed_ats_sources
from austechmap_ingestion.hiring.company_sources import (
    AtsSourceOperationError,
    list_active_ats_sources,
    set_ats_source_status,
)
from austechmap_ingestion.hiring.normalisation import SkillDef
from austechmap_ingestion.hiring.pipeline import run_ats_crawl
from austechmap_ingestion.hiring.replay import AtsReplayError, replay_ats_snapshot
from austechmap_ingestion.hiring.signals import derive_employer_hiring_signals
from austechmap_ingestion.hiring.taxonomy_seed import SKILLS, seed_taxonomy
from austechmap_ingestion.jobs import JobError, JobRepository
from austechmap_ingestion.observability import (
    build_error_reporter_from_env,
    configure_structured_logging,
)
from austechmap_ingestion.regional.jsa import JsaImportError, run_ivi_import, run_nero_import
from austechmap_ingestion.regional.persistence import generate_region_opportunity_scores
from austechmap_ingestion.sample_importer import run_sample_import
from austechmap_ingestion.storage import (
    FilesystemSnapshotStore,
    SnapshotStorageError,
    build_snapshot_store_from_env,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Australia Tech Map ingestion worker")
    subparsers = parser.add_subparsers(dest="command", required=True)
    health_parser = subparsers.add_parser("health", help="emit worker health as JSON")
    health_parser.add_argument("--run-id", default="local")
    migrate_parser = subparsers.add_parser("migrate", help="apply pending database migrations")
    migrate_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    migrate_parser.add_argument("--migrations-dir", type=Path, default=Path("db/migrations"))
    sample_parser = subparsers.add_parser(
        "sample-import", help="persist a local file as an audited sample import"
    )
    sample_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    sample_parser.add_argument("--source-key", default="sample-source")
    sample_parser.add_argument("--content-type", default="application/json")
    sample_parser.add_argument("--worker-id", default="sample-importer")
    sample_parser.add_argument(
        "--snapshot-root",
        type=Path,
        help="force filesystem storage at this path instead of RAW_SNAPSHOT_BACKEND",
    )
    sample_parser.add_argument("input", type=Path)
    seed_parser = subparsers.add_parser(
        "seed-employers", help="seed the alpha-cohort employer candidates into companies"
    )
    seed_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    seed_parser.add_argument(
        "--fixture",
        type=Path,
        default=DEFAULT_FIXTURE_PATH,
        help="candidate CSV to seed from (defaults to the alpha cohort fixture)",
    )
    location_parser = subparsers.add_parser(
        "seed-locations",
        help="geocode the alpha-cohort address research and link it to seeded companies",
    )
    location_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    location_parser.add_argument(
        "--provider",
        choices=["nominatim", "mapbox"],
        default="nominatim",
        help="geocoding provider: nominatim needs no signup (default); "
        "mapbox needs --mapbox-token / MAPBOX_TOKEN",
    )
    location_parser.add_argument("--mapbox-token", default=os.environ.get("MAPBOX_TOKEN"))
    location_parser.add_argument(
        "--fixture",
        type=Path,
        default=DEFAULT_ADDRESS_FIXTURE_PATH,
        help="address CSV to geocode from (defaults to the alpha cohort address fixture)",
    )
    quarantine_parser = subparsers.add_parser(
        "quarantine-low-specificity-locations",
        help="dry-run or quarantine accepted external points from an unsupported address fixture",
    )
    quarantine_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    quarantine_parser.add_argument("--fixture", type=Path, required=True)
    quarantine_parser.add_argument("--actor-id", default="cohort-location-cleanup")
    quarantine_parser.add_argument("--reason", required=True)
    quarantine_parser.add_argument(
        "--apply",
        action="store_true",
        help="perform the audited quarantine (without this flag, only report the target set)",
    )
    taxonomy_parser = subparsers.add_parser(
        "seed-taxonomy", help="seed the v1 role-family and skills taxonomies"
    )
    taxonomy_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    category_seed_parser = subparsers.add_parser(
        "seed-categories", help="seed the v1 company/technology niche taxonomy (Appendix A.1)"
    )
    category_seed_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    category_classify_parser = subparsers.add_parser(
        "classify-employer-categories",
        help="keyword-classify seeded companies' niches from their seed-research reason text",
    )
    category_classify_parser.add_argument(
        "--database-url", default=os.environ.get("DATABASE_URL")
    )
    ats_seed_parser = subparsers.add_parser(
        "seed-ats-sources", help="register the manually verified ATS sources"
    )
    ats_seed_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    crawl_parser = subparsers.add_parser(
        "crawl-jobs", help="fetch job postings from a registered ATS source and persist them"
    )
    crawl_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    crawl_selection = crawl_parser.add_mutually_exclusive_group(required=True)
    crawl_selection.add_argument("--ats-identifier")
    crawl_selection.add_argument("--all", action="store_true")
    crawl_selection.add_argument(
        "--due", action="store_true", help="crawl only active sources whose due time has arrived"
    )
    crawl_parser.add_argument("--worker-id", default="ats-crawler")
    crawl_parser.add_argument(
        "--snapshot-root",
        type=Path,
        help="force filesystem storage at this path instead of RAW_SNAPSHOT_BACKEND",
    )
    source_status_parser = subparsers.add_parser(
        "set-ats-source-status", help="pause, quarantine, disable, or reactivate an ATS source"
    )
    source_status_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    source_status_parser.add_argument(
        "--ats-provider",
        choices=["lever", "ashby", "greenhouse", "smartrecruiters", "workable"],
        required=True,
    )
    source_status_parser.add_argument("--ats-identifier", required=True)
    source_status_parser.add_argument(
        "--status", choices=["active", "paused", "quarantined", "disabled"], required=True
    )
    source_status_parser.add_argument("--reason", required=True)
    source_status_parser.add_argument("--actor-id", default="ats-source-operator")
    replay_parser = subparsers.add_parser(
        "replay-ats-snapshot",
        help="read and re-parse a succeeded ATS snapshot without mutating current jobs",
    )
    replay_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    replay_parser.add_argument("--run-id", type=uuid.UUID, required=True)
    replay_parser.add_argument(
        "--snapshot-root",
        type=Path,
        help="force filesystem storage at this path instead of RAW_SNAPSHOT_BACKEND",
    )
    sponsorship_derive_parser = subparsers.add_parser(
        "derive-sponsorship-evidence",
        help="classify real job postings for explicit sponsorship mentions",
    )
    sponsorship_derive_parser.add_argument(
        "--database-url", default=os.environ.get("DATABASE_URL")
    )
    hiring_signals_parser = subparsers.add_parser(
        "derive-hiring-signals",
        help="derive employer role demand and skill signals from real job postings",
    )
    hiring_signals_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    hiring_signals_parser.add_argument("--period-days", type=int, default=30)
    labour_agreement_parser = subparsers.add_parser(
        "match-labour-agreements",
        help="match the Home Affairs current-labour-agreements list against real companies",
    )
    labour_agreement_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    labour_agreement_parser.add_argument(
        "--fixture",
        type=Path,
        required=True,
        help="labour-agreements CSV to match from (no default -- see employers/"
        "labour_agreements.py)",
    )
    jsa_parser = subparsers.add_parser(
        "import-jsa",
        help="import a downloaded JSA NERO or IVI release with an immutable raw snapshot",
    )
    jsa_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    jsa_parser.add_argument("--dataset", choices=["nero", "ivi"], required=True)
    jsa_parser.add_argument(
        "--source-version",
        required=True,
        help="official release identifier, such as 2026-08 for NERO or 2026-07 for IVI",
    )
    jsa_parser.add_argument("--worker-id", default="jsa-importer")
    jsa_parser.add_argument(
        "--snapshot-root",
        type=Path,
        help="force filesystem storage at this path instead of RAW_SNAPSHOT_BACKEND",
    )
    jsa_parser.add_argument("input", type=Path, help="official NERO ZIP or IVI XLSX file")
    regional_score_parser = subparsers.add_parser(
        "score-regions",
        help="append reproducible SA4 opportunity scores or explicit suppression records",
    )
    regional_score_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    regional_score_parser.add_argument(
        "--region-code", help="score one active SA4 code instead of every active SA4"
    )
    regional_score_parser.add_argument(
        "--period-end",
        type=date.fromisoformat,
        help="score window end date in YYYY-MM-DD format (defaults to today)",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "health":
        print(json.dumps(build_health(args.run_id), separators=(",", ":"), sort_keys=True))
        return 0

    if args.command == "migrate":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            applied = apply_migrations(args.database_url, args.migrations_dir)
        except (MigrationError, psycopg.Error) as error:
            print(f"Migration failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "applied": [migration.filename for migration in applied],
                    "count": len(applied),
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "sample-import":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            logger = configure_structured_logging()
            reporter = build_error_reporter_from_env()
            store = (
                FilesystemSnapshotStore(args.snapshot_root)
                if args.snapshot_root is not None
                else build_snapshot_store_from_env()
            )
            result = run_sample_import(
                JobRepository(args.database_url),
                store,
                source_key=args.source_key,
                content=args.input.read_bytes(),
                content_type=args.content_type,
                worker_id=args.worker_id,
                logger=logger,
                error_reporter=reporter,
            )
        except (JobError, OSError, SnapshotStorageError, ValueError, psycopg.Error) as error:
            print(f"Sample import failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "created": result.created,
                    "runId": str(result.run_id),
                    "snapshotId": str(result.snapshot_id) if result.snapshot_id else None,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "seed-employers":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            stats = run_seed_import(args.database_url, args.fixture)
        except (SeedImportError, psycopg.Error) as error:
            print(f"Seed import failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "created": stats.created,
                    "matched": stats.matched,
                    "review": stats.review,
                    "skippedLowConfidence": list(stats.skipped_low_confidence),
                    "errors": [
                        {"name": name, "error": message} for name, message in stats.errors
                    ],
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "seed-locations":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        if args.provider == "mapbox" and not args.mapbox_token:
            print("MAPBOX_TOKEN or --mapbox-token is required for --provider mapbox")
            return 2
        geocode_fn = geocode_address if args.provider == "mapbox" else geocode_address_nominatim
        credential = args.mapbox_token if args.provider == "mapbox" else ""
        try:
            location_stats = run_location_seed_import(
                args.database_url, credential, args.fixture, geocode_fn=geocode_fn
            )
        except (LocationSeedError, GeocodingError, psycopg.Error) as error:
            print(f"Location seed import failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "resolved": location_stats.resolved,
                    "reused": location_stats.reused,
                    "unmatchedDomains": list(location_stats.unmatched_domains),
                    "errors": [
                        {"domain": domain, "error": message}
                        for domain, message in location_stats.errors
                    ],
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "quarantine-low-specificity-locations":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            cleanup_stats = quarantine_low_specificity_locations(
                args.database_url,
                fixture_path=args.fixture,
                actor_id=args.actor_id,
                reason=args.reason,
                apply=args.apply,
            )
        except (LocationQualityError, OSError, psycopg.Error) as error:
            print(f"Location cleanup failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "affectedCompanies": cleanup_stats.affected_companies,
                    "affectedLocations": cleanup_stats.affected_locations,
                    "applied": cleanup_stats.applied,
                    "fixtureCandidates": cleanup_stats.fixture_candidates,
                    "matchedFixtureDomains": cleanup_stats.matched_fixture_domains,
                    "unmatchedFixtureDomains": list(cleanup_stats.unmatched_fixture_domains),
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "seed-taxonomy":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            taxonomy_stats = seed_taxonomy(args.database_url)
        except psycopg.Error as error:
            print(f"Taxonomy seed failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "roleFamiliesCreated": taxonomy_stats.role_families_created,
                    "skillsCreated": taxonomy_stats.skills_created,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "seed-categories":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            category_stats = seed_categories(args.database_url)
        except psycopg.Error as error:
            print(f"Category seed failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "groupsCreated": category_stats.groups_created,
                    "nichesCreated": category_stats.niches_created,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "classify-employer-categories":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            apply_stats = apply_company_categories(args.database_url)
        except psycopg.Error as error:
            print(f"Category classification failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "companiesConsidered": apply_stats.companies_considered,
                    "companiesMatched": apply_stats.companies_matched,
                    "linksCreated": apply_stats.links_created,
                    "companiesWithoutReason": list(apply_stats.companies_without_reason),
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "seed-ats-sources":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            ats_stats = seed_ats_sources(args.database_url)
        except (AtsSourceSeedError, psycopg.Error) as error:
            print(f"ATS source seed failed: {error}")
            return 1
        print(
            json.dumps(
                {"created": ats_stats.created, "reused": ats_stats.reused},
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "crawl-jobs":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            sources = list_active_ats_sources(
                args.database_url,
                ats_identifier=args.ats_identifier,
                due_at=datetime.now(UTC) if args.due else None,
            )
            store = (
                FilesystemSnapshotStore(args.snapshot_root)
                if args.snapshot_root is not None
                else build_snapshot_store_from_env()
            )
            skills = tuple(SkillDef(key=s.key, label=s.label, aliases=s.aliases) for s in SKILLS)
            repository = JobRepository(args.database_url)
            results = [
                run_ats_crawl(
                    repository,
                    store,
                    database_url=args.database_url,
                    company_ats_source=source,
                    skills=skills,
                    worker_id=args.worker_id,
                )
                for source in sources
            ]
        except (
            AtsSourceOperationError,
            JobError,
            OSError,
            SnapshotStorageError,
            ValueError,
            psycopg.Error,
        ) as error:
            print(f"Job crawl failed: {error}")
            return 1
        print(
            json.dumps(
                [
                    {
                        "runId": str(result.run_id),
                        "created": result.created,
                        "fetched": result.fetched,
                        "jobsCreated": result.jobs_created,
                        "jobsUpdated": result.jobs_updated,
                        "jobsUnchanged": result.jobs_unchanged,
                        "jobsExpired": result.jobs_expired,
                    }
                    for result in results
                ],
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "set-ats-source-status":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            state = set_ats_source_status(
                args.database_url,
                ats_provider=args.ats_provider,
                ats_identifier=args.ats_identifier,
                status=args.status,
                reason=args.reason,
                actor_id=args.actor_id,
            )
        except (AtsSourceOperationError, ValueError, psycopg.Error) as error:
            print(f"ATS source status change failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "id": str(state.id),
                    "status": state.status,
                    "consecutiveFailures": state.consecutive_failures,
                    "nextCrawlAt": state.next_crawl_at.isoformat(),
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "replay-ats-snapshot":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            store = (
                FilesystemSnapshotStore(args.snapshot_root)
                if args.snapshot_root is not None
                else build_snapshot_store_from_env()
            )
            skills = tuple(SkillDef(key=s.key, label=s.label, aliases=s.aliases) for s in SKILLS)
            replay = replay_ats_snapshot(
                args.database_url,
                store,
                run_id=args.run_id,
                skills=skills,
            )
        except (AtsReplayError, SnapshotStorageError, ValueError, psycopg.Error) as error:
            print(f"ATS snapshot replay failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "originalRunId": str(replay.original_run_id),
                    "atsProvider": replay.ats_provider,
                    "atsIdentifier": replay.ats_identifier,
                    "snapshotSha256": replay.snapshot_sha256,
                    "jobCount": len(replay.jobs),
                    "jobs": [
                        {
                            "externalId": job.external_id,
                            "title": job.title,
                            "contentHash": job.content_hash,
                            "roleFamilyKey": job.role_family_key,
                            "seniority": job.seniority,
                            "remoteType": job.remote_type,
                        }
                        for job in replay.jobs
                    ],
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "derive-sponsorship-evidence":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            sponsorship_stats = derive_sponsorship_evidence_from_jobs(args.database_url)
        except psycopg.Error as error:
            print(f"Sponsorship evidence derivation failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "companiesConsidered": sponsorship_stats.companies_considered,
                    "currentEvidenceCreated": sponsorship_stats.current_evidence_created,
                    "historicalEvidenceCreated": sponsorship_stats.historical_evidence_created,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "derive-hiring-signals":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            signals_stats = derive_employer_hiring_signals(
                args.database_url, period_days=args.period_days
            )
        except psycopg.Error as error:
            print(f"Hiring signals derivation failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "companiesConsidered": signals_stats.companies_considered,
                    "roleSignalsCreated": signals_stats.role_signals_created,
                    "roleSignalsUpdated": signals_stats.role_signals_updated,
                    "skillSignalsCreated": signals_stats.skill_signals_created,
                    "skillSignalsUpdated": signals_stats.skill_signals_updated,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "match-labour-agreements":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            records = load_labour_agreements_fixture(args.fixture)
            labour_agreement_stats = match_labour_agreements(args.database_url, records)
        except (LabourAgreementError, psycopg.Error) as error:
            print(f"Labour agreement match failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "companiesConsidered": labour_agreement_stats.companies_considered,
                    "exactMatches": labour_agreement_stats.exact_matches,
                    "reviewQueueItemsCreated": labour_agreement_stats.review_queue_items_created,
                    "noMatch": labour_agreement_stats.no_match,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "import-jsa":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            store = (
                FilesystemSnapshotStore(args.snapshot_root)
                if args.snapshot_root is not None
                else build_snapshot_store_from_env()
            )
            importer = run_nero_import if args.dataset == "nero" else run_ivi_import
            jsa_result = importer(
                JobRepository(args.database_url),
                store,
                args.database_url,
                source_version=args.source_version,
                file_path=args.input,
                worker_id=args.worker_id,
            )
        except (
            JobError,
            JsaImportError,
            OSError,
            SnapshotStorageError,
            ValueError,
            psycopg.Error,
        ) as error:
            print(f"JSA import failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "created": jsa_result.created,
                    "dataset": jsa_result.dataset,
                    "recordsInserted": jsa_result.records_inserted,
                    "recordsSeen": jsa_result.records_seen,
                    "recordsUnchanged": jsa_result.records_unchanged,
                    "runId": str(jsa_result.run_id),
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "score-regions":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            scores = generate_region_opportunity_scores(
                args.database_url,
                region_code=args.region_code,
                period_end=args.period_end,
            )
        except (ValueError, psycopg.Error) as error:
            print(f"Regional scoring failed: {error}")
            return 1
        print(
            json.dumps(
                [
                    {
                        "id": str(score.id),
                        "regionCode": score.region_code,
                        "score": score.score,
                        "sufficient": score.sufficient,
                        "suppressionReasons": list(score.suppression_reasons),
                        "created": score.created,
                    }
                    for score in scores
                ],
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
