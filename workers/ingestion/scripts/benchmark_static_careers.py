"""Measure static-careers parser throughput against the frozen fixture.

Run from workers/ingestion:
    .venv\\Scripts\\python.exe scripts/benchmark_static_careers.py --iterations 1000
"""

from __future__ import annotations

import argparse
import statistics
import time
from pathlib import Path

from austechmap_ingestion.hiring.static_careers import parse_static_careers_page


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=1_000)
    args = parser.parse_args()
    if args.iterations < 1:
        raise ValueError("iterations must be positive")
    fixture = Path(__file__).parents[1] / "tests" / "fixtures" / "static_careers_structured.html"
    html = fixture.read_bytes()
    timings: list[float] = []
    for _ in range(args.iterations):
        started = time.perf_counter()
        parse_static_careers_page(html, page_url="https://careers.example.test/jobs")
        timings.append(time.perf_counter() - started)
    p95 = statistics.quantiles(timings, n=20)[18] if len(timings) >= 20 else max(timings)
    print(
        f"iterations={args.iterations} median_ms={statistics.median(timings) * 1_000:.3f} "
        f"p95_ms={p95 * 1_000:.3f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
