import argparse
import json
from collections.abc import Sequence

from austechmap_ingestion.health import build_health


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Australia Tech Map ingestion worker")
    subparsers = parser.add_subparsers(dest="command", required=True)
    health_parser = subparsers.add_parser("health", help="emit worker health as JSON")
    health_parser.add_argument("--run-id", default="local")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "health":
        print(json.dumps(build_health(args.run_id), separators=(",", ":"), sort_keys=True))
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
