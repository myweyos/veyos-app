"""Feeding the engine. Never reaching inside it.

The driver builds a snapshot and calls ``decide()``. It imports exactly three public names —
``decide``, ``Snapshot``, ``load_rulebook`` — the same triple ``backtest/runner.py`` uses, and
a test asserts it never reaches for ``evaluate.rule_fires`` or any underscore-prefixed name.
That is what "the driver feeds it snapshots, it does not reach inside" means mechanically.

Snapshot construction is three layers, applied in order:

    persona base (calm, optionally deep-merged with its crash delta)
      -> derived per-day fields from the clock (as_of, cycle_day, days_of_history)
        -> the day's explicit `patch`

An explicit patch therefore always wins over the clock, which is what lets a scenario say
"on this day, pretend it is cycle day 10" without fighting the arithmetic.

The `client` block never reaches ``decide()``. Permissions and user responses are consumed
only by the app-state derivation. That separation is the engine's purity, enforced by
construction rather than by convention.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from weyos_engine.config import REPO_ROOT, Rulebook, load_rulebook
from weyos_engine.engine import decide
from weyos_engine.models import Snapshot

from .app_state import derive_app_state, load_app_states, unevaluable_rule_ids
from .clock import DayClock, as_of_for, cycle_day_for

DEMO_FIXTURES = REPO_ROOT / "packages" / "demo-fixtures"
PERSONAS_PATH = DEMO_FIXTURES / "personas.json"
PROFILES_DIR = DEMO_FIXTURES / "profiles"
SCENARIOS_DIR = DEMO_FIXTURES / "scenarios"

PERSONA_IDS = ("sarah", "james", "alex")


def _strip_meta(value: Any) -> Any:
    """Drop ``$``-prefixed annotation keys. The JSON Schema forbids extra properties."""
    if isinstance(value, dict):
        return {k: _strip_meta(v) for k, v in value.items() if not k.startswith("$")}
    if isinstance(value, list):
        return [_strip_meta(v) for v in value]
    return value


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """Same merge semantics as golden.yaml's `overrides` and the engine CLI. No new rules."""
    out = copy.deepcopy(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def load_personas() -> dict[str, Any]:
    return _strip_meta(json.loads(PERSONAS_PATH.read_text(encoding="utf-8")))  # type: ignore[no-any-return]


def load_profile(persona: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((PROFILES_DIR / f"{persona}.json").read_text(encoding="utf-8"))
    return data


def load_scenario(scenario_id: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(
        (SCENARIOS_DIR / f"{scenario_id}.json").read_text(encoding="utf-8")
    )
    return data


def layer_map(book: Rulebook) -> dict[str, int]:
    """Rule id -> layer, so nothing has to parse a rule id string to guess its layer."""
    return {rule.id: rule.layer for rule in book.rules}


@dataclass(frozen=True)
class DayResult:
    """One scripted day, decided."""

    scenario_id: str
    persona: str
    day_index: int
    label: str
    snapshot: dict[str, Any]
    decision: dict[str, Any]
    app_state: str
    unevaluable: tuple[str, ...]
    expect: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """Committed golden form. Byte-reproducible; carries no wall-clock.

        Deliberately does NOT embed the whole Decision. golden.yaml is already the engine's
        regression net and restating it here would give two files that must agree about the
        same thing. What this pins is the drift-prone surface: the snapshot two independent
        drivers must build identically, and the app state derived from the decision.
        """
        return {
            "scenario_id": self.scenario_id,
            "persona": self.persona,
            "day_index": self.day_index,
            "label": self.label,
            "app_state": self.app_state,
            "engine_state": self.decision["state"],
            "fired": sorted(r["rule_id"] for r in self.decision["fired_rules"]),
            "unevaluable": sorted(self.unevaluable),
            "activity_verdict": self.decision["activity"]["verdict"],
            "warning_count": len(self.decision["warnings"]),
            "snapshot": self.snapshot,
        }


def build_snapshot(scenario: dict[str, Any], day_index: int, personas: dict[str, Any]) -> dict[str, Any]:
    """persona base -> clock-derived fields -> the day's patch."""
    day = scenario["days"][day_index]
    persona = personas[scenario["persona"]]

    raw = _strip_meta(persona["calm"])
    if day.get("state") == "crash":
        raw = _deep_merge(raw, _strip_meta(persona["crash"]))

    derived: dict[str, Any] = {"as_of": as_of_for(scenario["start_date"], day_index)}

    base_history = (raw.get("baselines") or {}).get("days_of_history")
    if base_history is not None:
        derived["baselines"] = {"days_of_history": base_history + day_index}

    # Skip the cycle arithmetic entirely when the day patches `cycle` itself — otherwise a
    # scenario could not step outside the running cycle without tripping the day-28 guard.
    patch = _strip_meta(day.get("patch") or {})
    if "cycle" not in patch:
        cycle_day = cycle_day_for(scenario.get("start_cycle_day"), day_index)
        if cycle_day is not None:
            derived["cycle"] = {"cycle_day": cycle_day}

    raw = _deep_merge(raw, derived)
    if patch:
        raw = _deep_merge(raw, patch)
    return raw


def decide_day(
    scenario: dict[str, Any],
    day_index: int,
    *,
    book: Rulebook | None = None,
    personas: dict[str, Any] | None = None,
    app_states: dict[str, Any] | None = None,
) -> DayResult:
    book = book or load_rulebook()
    personas = personas or load_personas()
    day = scenario["days"][day_index]

    snapshot = build_snapshot(scenario, day_index, personas)
    decision = decide(Snapshot.from_dict(snapshot), book)
    layers = layer_map(book)
    app_state = derive_app_state(
        decision,
        layers,
        client=day.get("client") or {},
        app_states=app_states or load_app_states(),
    )

    return DayResult(
        scenario_id=scenario["id"],
        persona=scenario["persona"],
        day_index=day_index,
        label=day.get("label", ""),
        snapshot=snapshot,
        decision=decision,
        app_state=app_state,
        unevaluable=tuple(unevaluable_rule_ids(decision)),
        expect=day.get("expect") or {},
    )


def run_scenario(
    scenario_id: str,
    *,
    book: Rulebook | None = None,
    personas: dict[str, Any] | None = None,
) -> list[DayResult]:
    scenario = load_scenario(scenario_id)
    book = book or load_rulebook()
    personas = personas or load_personas()
    app_states = load_app_states()
    return [
        decide_day(scenario, i, book=book, personas=personas, app_states=app_states)
        for i in range(len(scenario["days"]))
    ]


def snapshot_at(clock: DayClock, personas: dict[str, Any] | None = None) -> dict[str, Any]:
    """The snapshot the clock currently points at. Pure in (scenario_id, day_index)."""
    return build_snapshot(load_scenario(clock.scenario_id), clock.day_index, personas or load_personas())


def write_expected(out_dir: Path, scenario_id: str) -> list[Path]:
    """Write the committed golden output both drivers assert against."""
    target = out_dir / scenario_id
    target.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for result in run_scenario(scenario_id):
        path = target / f"day-{result.day_index:02d}.json"
        path.write_text(json.dumps(result.to_dict(), indent=2, sort_keys=True), encoding="utf-8")
        written.append(path)
    return written


def write_ui_decisions(out_dir: Path, scenario_id: str) -> list[Path]:
    """Write full Decision objects for the client to render.

    Separate from ``expected/`` on purpose. ``expected/`` is an ASSERTION target and
    deliberately omits the Decision, because golden.yaml is already the engine's regression
    net. These files are INPUT — the mobile app has no Python and no API yet, and
    apps/mobile/README.md is explicit that UI must be built against real engine output rather
    than invented data shapes. Nothing asserts against them; they are regenerated, never
    hand-edited.
    """
    target = out_dir / scenario_id
    target.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for result in run_scenario(scenario_id):
        path = target / f"day-{result.day_index:02d}.json"
        # The snapshot is included because a Decision deliberately carries no raw readings —
        # deltas exist only as prose inside fired_rules[].because. A signals tile therefore
        # cannot be built from a Decision alone. In Phase 3 this is what /v1/signals serves;
        # until then the client needs both in one file.
        payload = {
            "persona": result.persona,
            "day_index": result.day_index,
            "label": result.label,
            "app_state": result.app_state,
            "unevaluable": sorted(result.unevaluable),
            "snapshot": result.snapshot,
            "decision": result.decision,
        }
        path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        written.append(path)
    return written
