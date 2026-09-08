"""Transparent Phase 6B Regional Tech Opportunity Score.

The v1 score follows PRODUCT_SPEC.md section 18.4's published weights. It
returns a component breakdown even when the final score is suppressed, so an
operator can see exactly which inputs are missing without publishing false
precision to users.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from typing import TypedDict

METHODOLOGY_VERSION = "regional-opportunity-v1"

MIN_EMPLOYERS = 5
MIN_MONITORED_COVERAGE = 0.60
MIN_ACTIVE_JOBS = 3
MIN_HISTORY_DAYS = 14
MIN_OBSERVATION_DATES = 3


class ScoreComponent(TypedDict):
    raw: object
    normalized: float | None
    weight: float


class SufficiencyResult(TypedDict):
    sufficient: bool
    reasons: list[str]
    thresholds: dict[str, int | float]
    observed: dict[str, int | float]


@dataclass(frozen=True)
class RegionalScoreInputs:
    employer_count: int
    monitored_employer_count: int
    active_jobs: int
    current_window_jobs: int
    previous_window_jobs: int
    hiring_history_days: int
    hiring_observation_dates: int
    industry_count: int
    remote_hybrid_jobs: int
    early_career_jobs: int
    sponsorship_employer_count: int
    migration_context_strength: float
    nero_direction: float | None
    ivi_direction: float | None


@dataclass(frozen=True)
class RegionalScoreResult:
    score: float | None
    components: dict[str, ScoreComponent]
    sufficiency: SufficiencyResult
    methodology_version: str = METHODOLOGY_VERSION


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _share(numerator: int, denominator: int) -> float:
    return _clamp(numerator / denominator) if denominator > 0 else 0.0


def _direction_score(direction: float) -> float:
    """Map an imported direction value from [-1, 1] onto [0, 1]."""
    return _clamp((direction + 1.0) / 2.0)


def _momentum_score(inputs: RegionalScoreInputs) -> float:
    delta = inputs.current_window_jobs - inputs.previous_window_jobs
    relative_change = delta / max(inputs.previous_window_jobs, 1)
    return _clamp(0.5 + (relative_change * 0.25))


def score_region(inputs: RegionalScoreInputs) -> RegionalScoreResult:
    integer_values = (
        inputs.employer_count,
        inputs.monitored_employer_count,
        inputs.active_jobs,
        inputs.current_window_jobs,
        inputs.previous_window_jobs,
        inputs.hiring_history_days,
        inputs.hiring_observation_dates,
        inputs.industry_count,
        inputs.remote_hybrid_jobs,
        inputs.early_career_jobs,
        inputs.sponsorship_employer_count,
    )
    if any(value < 0 for value in integer_values):
        raise ValueError("regional score counts cannot be negative")
    if not 0.0 <= inputs.migration_context_strength <= 1.0:
        raise ValueError("migration context strength must be between 0 and 1")
    for direction in (inputs.nero_direction, inputs.ivi_direction):
        if direction is not None and not -1.0 <= direction <= 1.0:
            raise ValueError("JSA direction values must be between -1 and 1")

    coverage = _share(inputs.monitored_employer_count, inputs.employer_count)
    reasons: list[str] = []
    if inputs.employer_count < MIN_EMPLOYERS:
        reasons.append("insufficient_employer_depth")
    if coverage < MIN_MONITORED_COVERAGE:
        reasons.append("insufficient_monitored_coverage")
    if inputs.active_jobs < MIN_ACTIVE_JOBS:
        reasons.append("insufficient_active_jobs")
    if inputs.hiring_history_days < MIN_HISTORY_DAYS:
        reasons.append("insufficient_hiring_history")
    if inputs.hiring_observation_dates < MIN_OBSERVATION_DATES:
        reasons.append("insufficient_observation_cadence")
    if inputs.nero_direction is None:
        reasons.append("missing_nero")
    if inputs.ivi_direction is None:
        reasons.append("missing_ivi")

    labor_score = (
        None
        if inputs.nero_direction is None or inputs.ivi_direction is None
        else (
            _direction_score(inputs.nero_direction)
            + _direction_score(inputs.ivi_direction)
        )
        / 2.0
    )
    components: dict[str, ScoreComponent] = {
        "relevant_employer_depth": {
            "raw": inputs.employer_count,
            "normalized": _clamp(inputs.employer_count / 25.0),
            "weight": 0.20,
        },
        "current_relevant_vacancies": {
            "raw": inputs.active_jobs,
            "normalized": _clamp(inputs.active_jobs / 20.0),
            "weight": 0.20,
        },
        "hiring_momentum": {
            "raw": {
                "currentWindowJobs": inputs.current_window_jobs,
                "previousWindowJobs": inputs.previous_window_jobs,
                "historyDays": inputs.hiring_history_days,
                "observationDates": inputs.hiring_observation_dates,
            },
            "normalized": (
                _momentum_score(inputs)
                if inputs.hiring_history_days >= MIN_HISTORY_DAYS
                and inputs.hiring_observation_dates >= MIN_OBSERVATION_DATES
                else None
            ),
            "weight": 0.15,
        },
        "jsa_employment_vacancy_direction": {
            "raw": {
                "nero": inputs.nero_direction,
                "ivi": inputs.ivi_direction,
            },
            "normalized": labor_score,
            "weight": 0.15,
        },
        "employer_industry_diversity": {
            "raw": inputs.industry_count,
            "normalized": _clamp(inputs.industry_count / 8.0),
            "weight": 0.10,
        },
        "remote_hybrid_opportunity": {
            "raw": inputs.remote_hybrid_jobs,
            "normalized": _share(inputs.remote_hybrid_jobs, inputs.active_jobs),
            "weight": 0.05,
        },
        "graduate_early_career_opportunity": {
            "raw": inputs.early_career_jobs,
            "normalized": _share(inputs.early_career_jobs, inputs.active_jobs),
            "weight": 0.05,
        },
        "sponsorship_evidence_density": {
            "raw": inputs.sponsorship_employer_count,
            "normalized": _share(inputs.sponsorship_employer_count, inputs.employer_count),
            "weight": 0.05,
        },
        "regional_migration_context": {
            "raw": inputs.migration_context_strength,
            "normalized": _clamp(inputs.migration_context_strength),
            "weight": 0.05,
        },
    }
    sufficient = not reasons
    score = None
    if sufficient:
        score = round(
            sum(
                component["normalized"] * component["weight"]
                for component in components.values()
                if component["normalized"] is not None
            )
            * 100.0,
            2,
        )

    return RegionalScoreResult(
        score=score,
        components=components,
        sufficiency={
            "sufficient": sufficient,
            "reasons": reasons,
            "thresholds": {
                "minimumEmployers": MIN_EMPLOYERS,
                "minimumMonitoredCoverage": MIN_MONITORED_COVERAGE,
                "minimumActiveJobs": MIN_ACTIVE_JOBS,
                "minimumHistoryDays": MIN_HISTORY_DAYS,
                "minimumObservationDates": MIN_OBSERVATION_DATES,
            },
            "observed": {
                "employerCount": inputs.employer_count,
                "monitoredCoverage": round(coverage, 4),
                "activeJobs": inputs.active_jobs,
                "historyDays": inputs.hiring_history_days,
                "observationDates": inputs.hiring_observation_dates,
            },
        },
    )


def input_fingerprint(inputs: RegionalScoreInputs) -> str:
    encoded = json.dumps(asdict(inputs), separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()
