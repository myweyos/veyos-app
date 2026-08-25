"""Golden fixture runner.

Fixtures are data (fixtures/golden.yaml). This file is the only place that knows how to
turn an expectation key into an assertion. Add expectation keys here; never add a bespoke
test that duplicates a fixture.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest
import yaml

from weyos_engine.config import load_rulebook
from weyos_engine.engine import decide
from weyos_engine.models import Snapshot

FIXTURES = Path(__file__).parent / "fixtures"
PERSONAS = json.loads((FIXTURES / "personas.json").read_text(encoding="utf-8"))
GOLDEN = yaml.safe_load((FIXTURES / "golden.yaml").read_text(encoding="utf-8"))


def _strip_comments(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _strip_comments(v) for k, v in value.items() if not k.startswith("$")}
    if isinstance(value, list):
        return [_strip_comments(v) for v in value]
    return value


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def build_snapshot(fixture: dict[str, Any]) -> dict[str, Any]:
    persona = PERSONAS[fixture["persona"]]
    raw = _strip_comments(persona["calm"])
    if fixture.get("state") == "crash":
        raw = _deep_merge(raw, _strip_comments(persona["crash"]))
    if fixture.get("overrides"):
        raw = _deep_merge(raw, _strip_comments(fixture["overrides"]))
    return raw


def run(fixture: dict[str, Any]) -> dict[str, Any]:
    book = load_rulebook()
    return decide(
        Snapshot.from_dict(build_snapshot(fixture)),
        book,
        elemental_layer=fixture.get("elemental_layer"),
    )


def _ids() -> list[str]:
    return [f["id"] for f in GOLDEN]


def _params() -> list[Any]:
    out = []
    for fixture in GOLDEN:
        marks = []
        if fixture.get("xfail"):
            marks.append(pytest.mark.xfail(reason=fixture["xfail"], strict=True))
        out.append(pytest.param(fixture, marks=marks))
    return out


@pytest.mark.parametrize("fixture", _params(), ids=_ids())
def test_golden(fixture: dict[str, Any]) -> None:
    decision = run(fixture)
    expect = fixture["expect"]
    where = f"[{fixture['id']}] {fixture['description'].strip().splitlines()[0]}"

    if "state" in expect:
        assert decision["state"] == expect["state"], f"{where}: state"

    if "fired" in expect:
        actual = sorted(r["rule_id"] for r in decision["fired_rules"])
        assert actual == sorted(expect["fired"]), f"{where}: fired rules"

    activity = decision["activity"]
    for key, field in (
        ("activity_verdict", "verdict"),
        ("activity_prescribed", "prescribed"),
        ("activity_location", "location"),
        ("activity_decided_by", "decided_by"),
    ):
        if key in expect:
            assert activity[field] == expect[key], f"{where}: activity.{field}"

    food = decision["food"]
    for key in ("sodium_pct_delta", "hydration_pct_delta", "min_protein_g", "min_fiber_g"):
        if key in expect:
            assert food[key] == expect[key], f"{where}: food.{key}"

    for key, field, present in (
        ("blocked_tags_include", "blocked_tags", True),
        ("blocked_tags_exclude", "blocked_tags", False),
        ("mandated_tags_include", "mandated_tags", True),
        ("mandated_tags_exclude", "mandated_tags", False),
    ):
        for tag in expect.get(key, []):
            verb = "lacks" if present else "contains"
            assert (tag in food[field]) is present, f"{where}: {field} {verb} {tag}"

    removed = {entry["name"] for meal in food["meals"] for entry in meal["removed"]}
    for name in expect.get("food_removed_include", []):
        assert name in removed, f"{where}: expected {name!r} to be removed"

    present_items = {item["name"] for meal in food["meals"] for item in meal["items"]}
    if "item_present" in expect:
        wanted = expect["item_present"]
        assert wanted in present_items, f"{where}: expected {wanted!r} on the plate"
    if "item_absent" in expect:
        unwanted = expect["item_absent"]
        assert unwanted not in present_items, f"{where}: {unwanted!r} should be gone"

    for supplement in expect.get("supplements_include", []):
        assert supplement in decision["supplements"], f"{where}: supplement {supplement}"

    for key, value in (expect.get("constraints_include") or {}).items():
        assert decision["constraints"].get(key) == value, f"{where}: constraint {key}"

    if "warnings_match" in expect:
        assert any(expect["warnings_match"] in w for w in decision["warnings"]), \
            f"{where}: no warning matching {expect['warnings_match']!r} in {decision['warnings']}"

    if "trace_match" in expect:
        assert any(expect["trace_match"] in t["detail"] for t in decision["trace"]), \
            f"{where}: no trace entry matching {expect['trace_match']!r}"


def test_every_fired_output_is_traceable() -> None:
    """No value may appear in a decision without a rule id behind it."""
    for fixture in GOLDEN:
        if fixture.get("xfail"):
            continue
        decision = run(fixture)
        traced = {t["rule_id"] for t in decision["trace"]}
        for rule in decision["fired_rules"]:
            rid = rule["rule_id"]
            assert rid in traced, f"{fixture['id']}: {rid} fired without a trace entry"
        assert all(
            r["because"] for r in decision["fired_rules"]
        ), f"{fixture['id']}: fired rule with no reasons"


def test_engine_is_deterministic() -> None:
    """Same input, same rulebook, byte-identical output. No clock, no randomness, no I/O."""
    for fixture in GOLDEN:
        first = json.dumps(run(fixture), sort_keys=True)
        second = json.dumps(run(fixture), sort_keys=True)
        assert first == second, f"{fixture['id']}: engine output is not deterministic"


def test_no_raw_biometric_values_leak_into_reasons() -> None:
    """Traces carry deltas and thresholds, never a raw value bound to a subject.

    Weak but real check: the reason strings must not contain the subject_ref, and must be
    phrased as comparisons. Tighten this when the audit-log format is finalised.
    """
    for fixture in GOLDEN:
        decision = run(fixture)
        for rule in decision["fired_rules"]:
            for reason in rule["because"]:
                assert decision["subject_ref"] not in reason
