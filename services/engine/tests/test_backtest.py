"""Tests for the backtest harness.

Three jobs here:

1. **Pin the coupling to the engine.** The harness recovers per-rule outcome by reading
   ``decision["trace"]`` and matching the prefixes ``fired:`` / ``unevaluable:`` /
   ``suppressed:``. If engine.py restyles its trace, these tests go red — which is far
   better than the harness quietly reporting that nothing was ever unevaluable.

2. **Pin the generator to the published contract.** Generated snapshots are validated
   against ``signal-snapshot.schema.json``, the same schema the golden fixtures answer to.

3. **Pin the sweep to the thresholds.** A grid that does not actually straddle a rulebook
   threshold produces confident, meaningless numbers. These tests assert the boundary
   points land where the rulebook says they should — including which side of an inclusive
   ``gte`` and an exclusive ``lt`` they fall on.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backtest.generate import (
    BASELINES,
    GRIDS,
    apply_overrides,
    build_snapshot,
    generate,
)
from backtest.metrics import (
    STATUS_DISABLED,
    STATUS_EVALUATED,
    STATUS_SUPPRESSED,
    aggregate,
    categorise_warning,
)
from backtest.questions import count_conditions_with_value_z, raise_observations, raise_questions
from backtest.report import render_json, render_text
from backtest.runner import (
    TRACE_FIRED,
    TRACE_SUPPRESSED,
    TRACE_UNEVALUABLE,
    Corpus,
    iter_outcomes,
    load_directory,
)
from weyos_engine.config import load_rulebook
from weyos_engine.engine import decide
from weyos_engine.models import Snapshot

SCHEMAS = Path(__file__).resolve().parents[3] / "packages" / "shared-schema" / "schemas"
SNAPSHOT_SCHEMA = json.loads((SCHEMAS / "signal-snapshot.schema.json").read_text(encoding="utf-8"))

BOOK = load_rulebook()


def run_grid(name: str = "quick", **overrides: str):
    """Aggregate a whole preset. Returns the RunResult."""
    axes = apply_overrides(GRIDS[name], [f"{k}={v}" for k, v in overrides.items()])
    corpus = Corpus(label=name, items=generate(axes))
    outcomes = iter_outcomes(BOOK, corpus, elemental_layer=True)
    return aggregate(BOOK, outcomes, elemental_enabled=True, corpus_label=name)


# --------------------------------------------------------------------------- engine coupling


def test_trace_prefixes_still_match_the_engine() -> None:
    """The three prefixes the harness parses must still be what engine.py emits.

    Uses Alex's crash state with the elemental layer off, which is the one scenario that
    produces all three in a single decision: L1 rules fire, L5 is unevaluable with no labs,
    and L3/L4 are suppressed.
    """
    raw = json.loads(
        (
            Path(__file__).resolve().parents[3] / "packages" / "demo-fixtures" / "personas.json"
        ).read_text(encoding="utf-8")
    )
    base = {k: v for k, v in raw["alex"]["calm"].items() if not k.startswith("$")}
    crash = {k: v for k, v in raw["alex"]["crash"].items() if not k.startswith("$")}
    base["biometrics"] = {**base["biometrics"], **crash["biometrics"]}

    decision = decide(Snapshot.from_dict(base), BOOK, elemental_layer=False)
    prefixes = {
        row["detail"].split(":", 1)[0].strip()
        for row in decision["trace"]
        if row["step"] == "evaluate"
    }
    assert prefixes == {TRACE_FIRED, TRACE_UNEVALUABLE, TRACE_SUPPRESSED}


def test_harness_fired_set_matches_the_decision() -> None:
    """The harness must never disagree with the engine about what fired."""
    corpus = Corpus(label="t", items=generate(GRIDS["quick"], limit=200))
    for outcome in iter_outcomes(BOOK, corpus, elemental_layer=True):
        assert not (outcome.fired & outcome.unevaluable)
        assert not (outcome.fired & outcome.suppressed)


def test_suppressed_rules_are_reported_as_suppressed_not_as_never_firing() -> None:
    """Validated-only mode must not look like 'L3 and L4 simply never fire'."""
    corpus = Corpus(label="t", items=generate(GRIDS["quick"], limit=400))
    outcomes = iter_outcomes(BOOK, corpus, elemental_layer=False)
    result = aggregate(BOOK, outcomes, elemental_enabled=False, corpus_label="t")
    stats = result.by_id()

    assert stats["3.1"].status == STATUS_SUPPRESSED
    assert stats["4.2"].status == STATUS_SUPPRESSED
    assert stats["3.1"].fire_rate is None, "a suppressed rule has no fire rate, not a 0% one"
    assert stats["1.1"].status == STATUS_EVALUATED
    for rule_id in ("1.1", "1.2", "1.3", "2.1", "5.1"):
        assert stats[rule_id].status == STATUS_EVALUATED


def test_disabled_rules_report_null_rates_not_zero() -> None:
    result = run_grid("quick")
    stats = result.by_id()
    for rule_id in ("1.4", "4.4"):
        assert stats[rule_id].status == STATUS_DISABLED
        assert stats[rule_id].fire_rate is None
        assert stats[rule_id].evaluable_fire_rate is None
        assert stats[rule_id].fired == 0


# --------------------------------------------------------------------------- contract


def test_generated_snapshots_match_the_published_schema() -> None:
    jsonschema = pytest.importorskip("jsonschema")
    validator = jsonschema.Draft202012Validator(SNAPSHOT_SCHEMA)
    for _, snapshot in generate(GRIDS["quick"], limit=300):
        errors = list(validator.iter_errors(snapshot))
        assert not errors, [f"{e.json_path}: {e.validator}" for e in errors]


def test_fine_grid_null_sleep_still_validates() -> None:
    """The fine grid carries a null sleep reading — the schema must accept it."""
    jsonschema = pytest.importorskip("jsonschema")
    snapshot = build_snapshot(
        0,
        dosha="pitta",
        hrv_pct=100.0,
        rhr_pct=100.0,
        sleep_pct=None,
        wrist_temp_delta_c=0.0,
        cycle_day=None,
        env_profile="mild",
        lab_profile="none",
    )
    jsonschema.Draft202012Validator(SNAPSHOT_SCHEMA).validate(snapshot)
    assert snapshot["biometrics"]["sleep_deep_rem_pct"] is None
    assert snapshot["cycle"] is None


def test_generation_is_deterministic() -> None:
    """Same axes in, byte-identical corpus out. No clock, no RNG."""
    first = [(i, json.dumps(s, sort_keys=True)) for i, s in generate(GRIDS["quick"], limit=250)]
    second = [(i, json.dumps(s, sort_keys=True)) for i, s in generate(GRIDS["quick"], limit=250)]
    assert first == second


def test_limit_is_a_stable_prefix() -> None:
    full = [i for i, _ in generate(GRIDS["quick"], limit=100)]
    short = [i for i, _ in generate(GRIDS["quick"], limit=40)]
    assert full[:40] == short


# --------------------------------------------------------------------------- threshold straddling


@pytest.mark.parametrize(
    ("hrv_pct", "expected"),
    [(70.0, True), (80.0, True), (81.0, False), (100.0, False)],
)
def test_rule_1_1_boundary_is_inclusive(hrv_pct: float, expected: bool) -> None:
    """1.1 is pct_below_baseline_gte 20, so exactly 20% below MUST fire."""
    snapshot = build_snapshot(
        0,
        dosha="vata",
        hrv_pct=hrv_pct,
        rhr_pct=100.0,
        sleep_pct=95.0,
        wrist_temp_delta_c=0.0,
        cycle_day=None,
        env_profile="mild",
        lab_profile="none",
    )
    decision = decide(Snapshot.from_dict(snapshot), BOOK)
    assert ("1.1" in {r["rule_id"] for r in decision["fired_rules"]}) is expected


@pytest.mark.parametrize(
    ("sleep_pct", "expected"),
    [(55.0, True), (59.0, True), (60.0, False), (95.0, False)],
)
def test_rule_1_2_boundary_is_exclusive(sleep_pct: float, expected: bool) -> None:
    """1.2 is pct_of_baseline_lt 60, so exactly 60% of baseline must NOT fire."""
    snapshot = build_snapshot(
        0,
        dosha="vata",
        hrv_pct=100.0,
        rhr_pct=100.0,
        sleep_pct=sleep_pct,
        wrist_temp_delta_c=0.0,
        cycle_day=None,
        env_profile="mild",
        lab_profile="none",
    )
    decision = decide(Snapshot.from_dict(snapshot), BOOK)
    assert ("1.2" in {r["rule_id"] for r in decision["fired_rules"]}) is expected


@pytest.mark.parametrize(
    ("temp", "rhr_pct", "expected"),
    [
        (0.5, 105.0, True),   # both gates exactly met
        (0.5, 100.0, False),  # temp met, RHR not
        (0.0, 125.0, False),  # RHR high, temp not — THE JAMES GAP
        (0.9, 125.0, True),
    ],
)
def test_rule_1_3_dual_gate(temp: float, rhr_pct: float, expected: bool) -> None:
    snapshot = build_snapshot(
        0,
        dosha="vata",
        hrv_pct=100.0,
        rhr_pct=rhr_pct,
        sleep_pct=95.0,
        wrist_temp_delta_c=temp,
        cycle_day=None,
        env_profile="mild",
        lab_profile="none",
    )
    decision = decide(Snapshot.from_dict(snapshot), BOOK)
    assert ("1.3" in {r["rule_id"] for r in decision["fired_rules"]}) is expected


def test_default_grid_straddles_every_enabled_numeric_threshold() -> None:
    """Each biometric axis must contain at least one firing and one non-firing point.

    Without this, a grid change could silently make a rule unreachable and the report would
    show a confident 0.0% instead of an obviously broken sweep.
    """
    result = run_grid("boundary" if "boundary" in GRIDS else "quick")
    for stat in result.rules:
        if stat.status != STATUS_EVALUATED:
            continue
        assert stat.fired > 0, f"rule {stat.rule_id} never fired — the grid does not reach it"
        assert stat.not_fired > 0, f"rule {stat.rule_id} always fired — the grid never falsifies it"


# --------------------------------------------------------------------------- metrics


def test_layer_2_rules_are_mutually_exclusive() -> None:
    """The rulebook says exactly one L2 rule fires. Verify it over the whole sweep."""
    result = run_grid("quick")
    assert result.invariants.multi_fire.get(2, 0) == 0
    for a, b in [("2.1", "2.2"), ("2.1", "2.3"), ("2.3", "2.4"), ("2.2", "2.4")]:
        assert result.cofiring.count(a, b) == 0


def test_layer_3_rules_are_mutually_exclusive_and_always_fire() -> None:
    result = run_grid("quick")
    assert result.invariants.multi_fire.get(3, 0) == 0
    assert result.invariants.l3_silent == 0
    assert result.cofiring.count("3.1", "3.2") == 0


def test_cofiring_is_symmetric_and_bounded() -> None:
    result = run_grid("quick")
    ids = [s.rule_id for s in result.rules]
    for a in ids:
        for b in ids:
            if a == b:
                continue
            assert result.cofiring.count(a, b) == result.cofiring.count(b, a)
            assert result.cofiring.count(a, b) <= min(
                result.cofiring.fired.get(a, 0), result.cofiring.fired.get(b, 0)
            )
            conditional = result.cofiring.conditional(a, b)
            assert conditional is None or 0.0 <= conditional <= 1.0


def test_conditional_is_none_when_the_antecedent_never_fired() -> None:
    """P(b|a) with a never firing is undefined, not zero."""
    result = run_grid("quick")
    assert result.cofiring.conditional("1.4", "3.1") is None


def test_rule_totals_are_internally_consistent() -> None:
    result = run_grid("quick")
    for stat in result.rules:
        assert stat.total == result.total
        assert stat.fired + stat.not_fired + stat.unevaluable + stat.suppressed == stat.total
        assert stat.fired >= 0 and stat.not_fired >= 0


def test_layer_5_is_unevaluable_without_labs_not_false() -> None:
    """Absent != normal. A lab rule with no lab attached must be UNKNOWN."""
    result = run_grid("quick", lab_profile="none")
    stats = result.by_id()
    for rule_id in ("5.1", "5.2", "5.3"):
        assert stats[rule_id].unevaluable == result.total
        assert stats[rule_id].evaluable_fire_rate is None


def test_layer_2_is_unevaluable_for_a_subject_with_no_cycle() -> None:
    """The observation the harness raises: no cycle reads as UNKNOWN, not not-applicable."""
    result = run_grid("quick", cycle_day="none")
    stats = result.by_id()
    for rule_id in ("2.1", "2.2", "2.3", "2.4"):
        assert stats[rule_id].unevaluable == result.total
        assert stats[rule_id].fired == 0


def test_warning_categorisation() -> None:
    assert categorise_warning("cold start: 10 days of history against a minimum of 28") == "cold_start"
    assert categorise_warning("cycle_day 31 is outside ... UNDEFINED in rulebook v1") == "cycle_day_undefined"
    assert categorise_warning("hrv_ms: no baseline available, dependent rules were skipped") == "no_baseline"
    assert categorise_warning("something nobody has seen before") == "uncategorised"


# --------------------------------------------------------------------------- axis overrides


def test_axis_override_reaches_the_undefined_cycle_region() -> None:
    """cycle_day > 28 is an open question; the harness must be able to measure it."""
    result = run_grid("quick", cycle_day="29,31,35")
    assert result.warnings.get("cycle_day_undefined", 0) == result.total
    stats = result.by_id()
    for rule_id in ("2.1", "2.2", "2.3", "2.4"):
        assert stats[rule_id].fired == 0


def test_axis_override_can_make_layer_4_rules_co_fire() -> None:
    """L4 exclusivity in the stock grids is a generator artefact, not a rulebook property."""
    result = run_grid("quick", env_profile="heatwave_full_moon")
    assert result.cofiring.count("4.1", "4.2") > 0


def test_bad_axis_specs_are_rejected() -> None:
    with pytest.raises(ValueError, match="unknown axis"):
        apply_overrides(GRIDS["quick"], ["not_an_axis=1"])
    with pytest.raises(ValueError, match="NAME=v1"):
        apply_overrides(GRIDS["quick"], ["cycle_day"])
    with pytest.raises(ValueError, match="unknown dosha"):
        apply_overrides(GRIDS["quick"], ["dosha=sanguine"])
    with pytest.raises(ValueError, match="no values"):
        apply_overrides(GRIDS["quick"], ["cycle_day="])


# --------------------------------------------------------------------------- directory corpus


def test_runs_over_a_directory_of_snapshot_files(tmp_path: Path) -> None:
    for snapshot_id, snapshot in generate(GRIDS["quick"], limit=24):
        (tmp_path / f"{snapshot_id}.json").write_text(json.dumps(snapshot), encoding="utf-8")

    errors: list = []
    corpus = Corpus(label="dir", items=load_directory(tmp_path, errors=errors), errors=errors)
    result = aggregate(
        BOOK, iter_outcomes(BOOK, corpus, elemental_layer=True), elemental_enabled=True, errors=errors
    )
    assert result.total == 24
    assert not errors


def test_a_malformed_file_is_recorded_not_fatal(tmp_path: Path) -> None:
    for snapshot_id, snapshot in generate(GRIDS["quick"], limit=6):
        (tmp_path / f"{snapshot_id}.json").write_text(json.dumps(snapshot), encoding="utf-8")
    (tmp_path / "broken.json").write_text("{ not json", encoding="utf-8")
    (tmp_path / "wrong_shape.json").write_text('{"schema_version": 1}', encoding="utf-8")

    errors: list = []
    corpus = Corpus(label="dir", items=load_directory(tmp_path, errors=errors), errors=errors)
    result = aggregate(
        BOOK, iter_outcomes(BOOK, corpus, elemental_layer=True), elemental_enabled=True, errors=errors
    )
    assert result.total == 6, "good snapshots still evaluated"
    assert {e.kind for e in errors} == {"invalid_json", "malformed_snapshot"}


def test_load_errors_never_quote_a_value(tmp_path: Path) -> None:
    """CLAUDE.md rule 5 applies to the harness too: no raw biometrics in error output."""
    (tmp_path / "bad.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "subject_ref": "sub_leak0001",
                "as_of": "2026-01-01",
                "constitution": {"dosha": "vata"},
                "biometrics": {"hrv_ms": 13.37},
                "labs": {"hs_crp": {"status": "high", "unexpected_key": 99.9}},
            }
        ),
        encoding="utf-8",
    )
    errors: list = []
    corpus = Corpus(label="dir", items=load_directory(tmp_path, errors=errors), errors=errors)
    list(iter_outcomes(BOOK, corpus, elemental_layer=True))
    assert errors
    for error in errors:
        assert "13.37" not in error.detail
        assert "99.9" not in error.detail


def test_directory_order_is_stable(tmp_path: Path) -> None:
    for snapshot_id, snapshot in generate(GRIDS["quick"], limit=20):
        (tmp_path / f"{snapshot_id}.json").write_text(json.dumps(snapshot), encoding="utf-8")
    errors: list = []
    first = [i for i, _ in load_directory(tmp_path, errors=errors)]
    second = [i for i, _ in load_directory(tmp_path, errors=errors)]
    assert first == second == sorted(first)


# --------------------------------------------------------------------------- questions


def test_zscore_mode_is_currently_indistinguishable_from_percent() -> None:
    """The headline finding: no rule condition defines value_z, so zscore falls back.

    If someone authors z-score thresholds this test goes red — which is the signal that the
    percent-vs-zscore question has become answerable, not that the harness broke.
    """
    assert count_conditions_with_value_z(BOOK) == 0

    from dataclasses import replace

    zbook = replace(BOOK, baseline={**BOOK.baseline, "comparison_mode": "zscore"})
    assert zbook.comparison_mode == "zscore"

    for _, snapshot in generate(GRIDS["quick"], limit=200):
        parsed = Snapshot.from_dict(snapshot)
        percent = {r["rule_id"] for r in decide(parsed, BOOK)["fired_rules"]}
        zscore = {r["rule_id"] for r in decide(parsed, zbook)["fired_rules"]}
        assert percent == zscore


def test_open_questions_are_raised_and_none_are_resolved() -> None:
    result = run_grid("quick")
    questions = raise_questions(BOOK, result)
    ids = {q.id for q in questions}
    assert {
        "percent-vs-zscore",
        "rule-1.2-sleep-measurement",
        "rule-1.4-cardiovascular-load",
        "cycle-day-over-28",
        "cold-start",
        "ginger-for-a-pitta",
        "rule-4.2-validated-only",
        "pollen-air-quality",
    } <= ids
    for question in questions:
        assert question.evidence, f"{question.id} was raised with no evidence"
        assert question.source


def test_harness_raises_the_not_applicable_observation() -> None:
    result = run_grid("quick")
    ids = {q.id for q in raise_observations(BOOK, result)}
    assert "unevaluable-vs-not-applicable" in ids
    assert "unknown-condition-emits-no-warning" in ids


def test_the_rulebook_is_never_written_to() -> None:
    """Belt and braces: a full run must not touch config/rules/."""
    rulebook_path = Path(__file__).resolve().parents[3] / "config" / "rules" / "rules.v1.yaml"
    before = rulebook_path.read_bytes()
    result = run_grid("quick")
    raise_questions(BOOK, result)
    raise_observations(BOOK, result)
    assert rulebook_path.read_bytes() == before


def test_disabled_rules_stay_disabled_through_a_whole_run() -> None:
    """The harness must never enable a proposed rule to make a nicer report."""
    result = run_grid("quick")
    assert result.by_id()["1.4"].status == STATUS_DISABLED
    assert result.cofiring.fired.get("1.4", 0) == 0


# --------------------------------------------------------------------------- report


def test_text_report_renders_and_carries_the_caveats() -> None:
    result = run_grid("quick")
    text = render_text(result, raise_questions(BOOK, result), raise_observations(BOOK, result))
    assert "COVERAGE OF THE INPUT SPACE" in text
    assert "OPEN SPEC QUESTIONS" in text
    assert "PER-RULE FIRING" in text
    assert "CO-FIRING" in text
    for stat in result.rules:
        assert stat.rule_id in text


def test_json_report_is_reproducible_and_has_no_timestamp() -> None:
    """Two identical runs must diff clean, so a rulebook change is the only thing that shows."""
    first = render_json(
        (r1 := run_grid("quick")), raise_questions(BOOK, r1), raise_observations(BOOK, r1)
    )
    second = render_json(
        (r2 := run_grid("quick")), raise_questions(BOOK, r2), raise_observations(BOOK, r2)
    )
    assert first == second

    payload = json.loads(first)
    assert "timestamp" not in payload and "generated_at" not in payload
    assert payload["rules"] and payload["cofiring"]
    assert payload["open_spec_questions"]


def test_json_report_marks_disabled_rules_with_null_rates() -> None:
    result = run_grid("quick")
    payload = json.loads(render_json(result, raise_questions(BOOK, result), []))
    disabled = [r for r in payload["rules"] if r["rule_id"] == "1.4"][0]
    assert disabled["status"] == STATUS_DISABLED
    assert disabled["fire_rate"] is None


def test_baselines_are_above_the_cold_start_minimum() -> None:
    """Otherwise the whole corpus degrades to insufficient_baseline and measures nothing."""
    assert BASELINES["days_of_history"] >= BOOK.min_days_for_baseline
