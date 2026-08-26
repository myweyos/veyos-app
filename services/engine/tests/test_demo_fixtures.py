"""Tests for packages/demo-fixtures and the demo driver.

Four jobs:

1. **Keep the driver outside the engine.** It may feed the engine snapshots; it may not reach
   inside it, read a clock, or use randomness. Asserted at source level, not by convention.
2. **Keep generated snapshots inside the contract.** Every snapshot the driver builds is
   validated against ``signal-snapshot.schema.json`` — which is what catches someone putting
   ``region`` in a snapshot, where the schema sets ``additionalProperties: false``.
3. **Prove the coverage claim.** Every persona reaches every app state it *declares* it can
   reach, and every exclusion carries a written reason. The union across personas is all six.
4. **Pin the defects, don't hide them.** F5 still reads as "in balance"; the cycle clock still
   refuses to run past day 28.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path
from typing import Any

import pytest

from demo_driver import (
    CYCLE_MAX_DAY,
    PERSONA_IDS,
    DayClock,
    UndefinedCycleDay,
    advance,
    build_snapshot,
    cycle_day_for,
    decide_day,
    layer_map,
    load_app_states,
    load_personas,
    load_profile,
    load_scenario,
    reset,
    run_scenario,
    snapshot_at,
)
from demo_driver.driver import DEMO_FIXTURES
from weyos_engine.config import load_rulebook

from .test_golden import GOLDEN

SCHEMAS = Path(__file__).resolve().parents[3] / "packages" / "shared-schema" / "schemas"
SNAPSHOT_SCHEMA = json.loads((SCHEMAS / "signal-snapshot.schema.json").read_text(encoding="utf-8"))
DECISION_SCHEMA = json.loads((SCHEMAS / "decision.schema.json").read_text(encoding="utf-8"))

DRIVER_DIR = Path(__file__).resolve().parents[1] / "demo_driver"
BOOK = load_rulebook()
PERSONAS = load_personas()
ALL_APP_STATES = {s["id"] for s in load_app_states()["states"]}


def _results(persona: str) -> list[Any]:
    return run_scenario(persona, book=BOOK, personas=PERSONAS)


# --------------------------------------------------------------------- driver stays outside


def test_driver_imports_only_the_public_engine_surface() -> None:
    """The driver feeds the engine. It does not reach inside it.

    backtest/runner.py makes this argument in prose; here it is a test. Importing
    ``evaluate.rule_fires`` or any underscore-prefixed name would let the driver re-implement
    arbitration and drift from the engine that ships.
    """
    allowed_modules = {"weyos_engine.config", "weyos_engine.engine", "weyos_engine.models"}
    for path in sorted(DRIVER_DIR.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom) or not node.module:
                continue
            if not node.module.startswith("weyos_engine"):
                continue
            assert node.module in allowed_modules, f"{path.name} imports {node.module}"
            for alias in node.names:
                assert not alias.name.startswith("_"), f"{path.name} imports private {alias.name}"


def test_driver_reads_no_clock_and_no_randomness() -> None:
    """CLAUDE.md rule 1. Date arithmetic on a scenario's own start_date is fine; `now` is not.

    Detected on the AST rather than by string search, so a docstring that *documents* the ban
    does not trip it — which a text match does, and did.
    """
    banned_calls = {
        ("datetime", "now"),
        ("datetime", "utcnow"),
        ("date", "today"),
        ("time", "time"),
        ("time", "monotonic"),
    }
    for path in sorted(DRIVER_DIR.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                pair = (node.value.id, node.attr)
                assert pair not in banned_calls, f"{path.name} calls {pair[0]}.{pair[1]}()"
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert alias.name.split(".")[0] != "random", f"{path.name} imports random"
            if isinstance(node, ast.ImportFrom) and node.module:
                assert node.module.split(".")[0] != "random", f"{path.name} imports from random"


# --------------------------------------------------------------------- contract


@pytest.mark.parametrize("persona", PERSONA_IDS)
def test_generated_snapshots_match_the_published_schema(persona: str) -> None:
    jsonschema = pytest.importorskip("jsonschema")
    validator = jsonschema.Draft202012Validator(SNAPSHOT_SCHEMA)
    scenario = load_scenario(persona)
    for day in range(len(scenario["days"])):
        snapshot = build_snapshot(scenario, day, PERSONAS)
        errors = list(validator.iter_errors(snapshot))
        assert not errors, [f"day {day}: {e.json_path} failed {e.validator}" for e in errors]


@pytest.mark.parametrize("persona", PERSONA_IDS)
def test_generated_decisions_match_the_published_schema(persona: str) -> None:
    jsonschema = pytest.importorskip("jsonschema")
    validator = jsonschema.Draft202012Validator(DECISION_SCHEMA)
    for result in _results(persona):
        errors = list(validator.iter_errors(result.decision))
        assert not errors, [f"day {result.day_index}: {e.json_path}" for e in errors]


def test_region_is_not_a_snapshot_field() -> None:
    """Region lives in the profile. Putting it in a snapshot would be a contract change."""
    assert "region" not in SNAPSHOT_SCHEMA["properties"]
    for persona in PERSONA_IDS:
        snapshot = build_snapshot(load_scenario(persona), 0, PERSONAS)
        assert "region" not in snapshot


# --------------------------------------------------------------------- the day-clock


def test_clock_is_deterministic() -> None:
    """Same (scenario, day_index) in, byte-identical snapshot out."""
    for persona in PERSONA_IDS:
        scenario = load_scenario(persona)
        for day in range(len(scenario["days"])):
            first = json.dumps(build_snapshot(scenario, day, PERSONAS), sort_keys=True)
            second = json.dumps(build_snapshot(scenario, day, PERSONAS), sort_keys=True)
            assert first == second


def test_ticking_equals_jumping() -> None:
    """Reaching day n by n ticks must equal jumping straight there."""
    clock = DayClock("james")
    for _ in range(4):
        clock = advance(clock)
    assert clock.day_index == 4
    stepped = json.dumps(snapshot_at(clock, PERSONAS), sort_keys=True)
    jumped = json.dumps(snapshot_at(DayClock("james", 4), PERSONAS), sort_keys=True)
    assert stepped == jumped


def test_reset_returns_to_day_zero() -> None:
    clock = advance(advance(DayClock("alex")))
    assert reset(clock) == DayClock("alex", 0)
    assert json.dumps(snapshot_at(reset(clock), PERSONAS), sort_keys=True) == json.dumps(
        snapshot_at(DayClock("alex", 0), PERSONAS), sort_keys=True
    )


def test_clock_refuses_to_run_past_cycle_day_28() -> None:
    """Wrapping would answer an open spec question inside a helper function."""
    assert cycle_day_for(20, 8) == CYCLE_MAX_DAY
    with pytest.raises(UndefinedCycleDay, match="undefined past day 28"):
        cycle_day_for(20, 9)


def test_clock_returns_none_for_a_subject_with_no_cycle() -> None:
    """None is 'no cycle tracking', which is not day zero and not a missing reading."""
    assert cycle_day_for(None, 5) is None


def test_negative_day_index_is_rejected() -> None:
    with pytest.raises(ValueError, match="day_index"):
        DayClock("sarah", -1)


# --------------------------------------------------------------------- app states


@pytest.mark.parametrize("persona", PERSONA_IDS)
def test_every_persona_reaches_every_reachable_app_state(persona: str) -> None:
    """The headline claim, checked against what the profile DECLARES it can reach.

    'Every app state it can reach' is the honest reading — not every persona can reach every
    state, and each exclusion has to be a written statement rather than a silently missing
    case.
    """
    profile = load_profile(persona)
    declared = {k for k, v in profile["app_states"].items() if v["reachable"]}
    actual = {r.app_state for r in _results(persona)}
    assert actual == declared, f"{persona}: declared {sorted(declared)}, reached {sorted(actual)}"


def test_every_declared_app_state_is_a_real_one() -> None:
    for persona in PERSONA_IDS:
        profile = load_profile(persona)
        assert set(profile["app_states"]) == ALL_APP_STATES, f"{persona} must declare all six"
        for state, entry in profile["app_states"].items():
            assert "via" in entry or not entry["reachable"], f"{persona}/{state} needs a reason"


def test_the_three_personas_together_cover_all_six_states() -> None:
    reached: set[str] = set()
    for persona in PERSONA_IDS:
        reached |= {r.app_state for r in _results(persona)}
    assert reached == ALL_APP_STATES


@pytest.mark.parametrize("persona", PERSONA_IDS)
def test_scenario_expectations_match_the_engine(persona: str) -> None:
    """Each scripted day asserts what it says it asserts."""
    for result in _results(persona):
        expect = result.expect
        where = f"{persona} day {result.day_index} ({result.label[:40]})"
        if "engine_state" in expect:
            assert result.decision["state"] == expect["engine_state"], f"{where}: engine_state"
        if "app_state" in expect:
            assert result.app_state == expect["app_state"], f"{where}: app_state"
        if "fired" in expect:
            actual = sorted(r["rule_id"] for r in result.decision["fired_rules"])
            assert actual == sorted(expect["fired"]), f"{where}: fired"
        if "activity_verdict" in expect:
            assert result.decision["activity"]["verdict"] == expect["activity_verdict"], where
        for rule_id in expect.get("unevaluable_includes", []):
            assert rule_id in result.unevaluable, f"{where}: {rule_id} should be unevaluable"


def test_pinned_fixture_ids_exist_in_golden_yaml() -> None:
    """`pins` links a scenario day to the fixture that already asserts the engine behaviour.

    It exists so this file never restates a golden assertion. A pin naming a fixture that does
    not exist means the link has rotted.
    """
    known = {f["id"] for f in GOLDEN}
    for persona in PERSONA_IDS:
        for day in load_scenario(persona)["days"]:
            for pin in (day.get("expect") or {}).get("pins", []):
                assert pin in known, f"{persona} day {day['day']} pins unknown fixture {pin}"


def test_app_state_mapping_carries_its_open_questions() -> None:
    """The mapping is allowed to be undecided. It is not allowed to be undecided silently."""
    states = load_app_states()
    assert states["open_questions"], "app-states.json must carry its open questions"
    for question in states["open_questions"]:
        for key in ("id", "question", "why_it_bites", "what_this_file_does", "needs"):
            assert question.get(key), f"open question {question.get('id')} missing {key}"


# --------------------------------------------------------------------- profiles


def test_profile_keys_never_shadow_a_snapshot_field() -> None:
    """One source of persona truth. A profile key colliding with a snapshot field is drift."""
    snapshot_fields = set(SNAPSHOT_SCHEMA["properties"])
    for persona in PERSONA_IDS:
        profile = load_profile(persona)
        keys = {k for k in profile if not k.startswith("$")}
        assert not (keys & snapshot_fields), f"{persona}: {keys & snapshot_fields}"


def test_every_profile_names_a_real_persona_and_scenario() -> None:
    for persona in PERSONA_IDS:
        profile = load_profile(persona)
        assert profile["persona"] in PERSONAS
        assert load_scenario(profile["scenario"])["persona"] == profile["persona"]


def test_region_agrees_with_the_snapshot_timezone() -> None:
    """Region is presentation metadata, but it must not contradict the signal payload."""
    expected_prefix = {"UK": "Europe/London", "US": "America/"}
    for persona in PERSONA_IDS:
        profile = load_profile(persona)
        timezone = build_snapshot(load_scenario(persona), 0, PERSONAS)["timezone"]
        assert timezone.startswith(expected_prefix[profile["region"]]), f"{persona}: {timezone}"


# --------------------------------------------------------------------- pinned defects


def test_f5_is_still_the_james_gap() -> None:
    """WRONG BUT CURRENT. Pinned so it cannot change silently.

    James's crash day has RHR 26% above baseline and still derives 'in balance', because rule
    1.3's dual gate evaluates cleanly to FALSE — no warnings, no unevaluable rows, nothing in
    the Decision to key on. See F5 / F5b and the rule 1.4 decision.
    """
    day = next(r for r in _results("james") if r.day_index == 1)
    assert day.app_state == "in_balance"
    assert day.decision["state"] == "calm"
    assert day.decision["warnings"] == []
    assert not [r for r in day.unevaluable if r.startswith("1.")]


@pytest.mark.xfail(
    reason="candidate rule 1.4 (Cardiovascular Load) is proposed and disabled; this flips the "
    "day it is approved, exactly as fixture F5b does",
    strict=True,
)
def test_james_gap_would_not_read_as_in_balance_once_rule_1_4_lands() -> None:
    day = next(r for r in _results("james") if r.day_index == 1)
    assert day.app_state != "in_balance"


def test_layer_2_is_unevaluable_for_a_subject_with_no_cycle() -> None:
    """The reason 'partial' is narrowed to Layer 1. Absent reads as unknown, not N/A."""
    day = next(r for r in _results("james") if r.day_index == 0)
    assert {"2.1", "2.2", "2.3", "2.4"} <= set(day.unevaluable)
    assert day.app_state == "in_balance", "narrowing to L1 is what keeps this out of 'partial'"


def test_layer_map_comes_from_the_rulebook_not_from_parsing_ids() -> None:
    layers = layer_map(BOOK)
    assert layers["1.1"] == 1 and layers["5.3"] == 5
    assert set(layers) == {rule.id for rule in BOOK.rules}


# --------------------------------------------------------------------- drift guard


@pytest.mark.parametrize("persona", PERSONA_IDS)
def test_committed_expected_output_is_current(persona: str) -> None:
    """packages/demo-fixtures/expected/ is what a second driver asserts against.

    If this fails, regenerate with `python -m demo_driver --generate` and read the diff before
    committing it — a change here means a scenario, the mapping, or the engine moved.
    """
    for result in _results(persona):
        path = DEMO_FIXTURES / "expected" / persona / f"day-{result.day_index:02d}.json"
        assert path.exists(), f"missing {path.name}; run `python -m demo_driver --generate`"
        committed = json.loads(path.read_text(encoding="utf-8"))
        assert committed == result.to_dict(), f"{persona} day {result.day_index} is stale"


def test_scenarios_have_no_duplicate_day_indexes() -> None:
    for persona in PERSONA_IDS:
        days = [d["day"] for d in load_scenario(persona)["days"]]
        assert days == sorted(set(days)) == list(range(len(days))), f"{persona}: {days}"


def test_decide_day_is_pure_in_its_inputs() -> None:
    """Two calls, byte-identical decision. No hidden state between days."""
    scenario = load_scenario("alex")
    first = decide_day(scenario, 1, book=BOOK, personas=PERSONAS)
    second = decide_day(scenario, 1, book=BOOK, personas=PERSONAS)
    assert json.dumps(first.decision, sort_keys=True) == json.dumps(second.decision, sort_keys=True)
    assert first.app_state == second.app_state
