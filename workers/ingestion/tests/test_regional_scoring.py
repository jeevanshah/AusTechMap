from __future__ import annotations

from dataclasses import replace

import pytest

from austechmap_ingestion.regional.scoring import (
    RegionalScoreInputs,
    input_fingerprint,
    score_region,
)


def sufficient_inputs() -> RegionalScoreInputs:
    return RegionalScoreInputs(
        employer_count=20,
        monitored_employer_count=15,
        active_jobs=10,
        current_window_jobs=10,
        previous_window_jobs=8,
        hiring_history_days=30,
        hiring_observation_dates=3,
        industry_count=4,
        remote_hybrid_jobs=4,
        early_career_jobs=2,
        sponsorship_employer_count=3,
        migration_context_strength=0.75,
        nero_direction=1.0,
        ivi_direction=0.0,
    )


def test_score_region_publishes_only_when_every_sufficiency_gate_passes() -> None:
    result = score_region(sufficient_inputs())

    assert result.sufficiency["sufficient"] is True
    assert result.sufficiency["reasons"] == []
    assert result.score == 58.19
    assert sum(component["weight"] for component in result.components.values()) == 1.0
    assert result.components["jsa_employment_vacancy_direction"]["normalized"] == 0.75


def test_score_region_explains_every_suppression_reason() -> None:
    result = score_region(
        RegionalScoreInputs(
            employer_count=2,
            monitored_employer_count=0,
            active_jobs=1,
            current_window_jobs=1,
            previous_window_jobs=0,
            hiring_history_days=2,
            hiring_observation_dates=1,
            industry_count=1,
            remote_hybrid_jobs=0,
            early_career_jobs=0,
            sponsorship_employer_count=0,
            migration_context_strength=0.0,
            nero_direction=None,
            ivi_direction=None,
        )
    )

    assert result.score is None
    assert result.sufficiency["sufficient"] is False
    assert result.sufficiency["reasons"] == [
        "insufficient_employer_depth",
        "insufficient_monitored_coverage",
        "insufficient_active_jobs",
        "insufficient_hiring_history",
        "insufficient_observation_cadence",
        "missing_nero",
        "missing_ivi",
    ]
    assert result.components["hiring_momentum"]["normalized"] is None
    assert result.components["jsa_employment_vacancy_direction"]["normalized"] is None


def test_input_fingerprint_is_deterministic_and_input_sensitive() -> None:
    inputs = sufficient_inputs()

    assert input_fingerprint(inputs) == input_fingerprint(inputs)
    assert input_fingerprint(inputs) != input_fingerprint(replace(inputs, active_jobs=11))


def test_score_region_rejects_out_of_contract_inputs() -> None:
    inputs = sufficient_inputs()

    with pytest.raises(ValueError, match="between -1 and 1"):
        score_region(replace(inputs, ivi_direction=1.2))
