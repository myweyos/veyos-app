"""TRUE / FALSE / UNKNOWN, as a full truth table.

A missing signal makes a condition UNKNOWN, and UNKNOWN is not FALSE. The combinators follow
Kleene's strong three-valued logic:

* ``all``: any FALSE makes it FALSE, else any UNKNOWN makes it UNKNOWN, else TRUE.
* ``any``: any TRUE makes it TRUE, else any UNKNOWN makes it UNKNOWN, else FALSE.

Only TRUE fires a rule. The engine traces an UNKNOWN rule as "unevaluable". A FALSE rule leaves
no evaluate row at all. That difference is what reaches the client as
``presentation.unevaluable_rule_ids`` (see services/engine-http/tests/test_sidecar.py).

Golden fixtures F14, F17 and F18 cover the same thing on the product rulebook and synthetic snapshots.
"""

from __future__ import annotations

import json
from itertools import product
from pathlib import Path
from typing import Any

import pytest

from weyos_engine.config import Rule, load_rulebook
from weyos_engine.engine import decide
from weyos_engine.evaluate import FALSE, TRUE, UNKNOWN, Tri, rule_fires
from weyos_engine.models import Snapshot

BOOK = load_rulebook()
SNAPSHOTS = Path(__file__).resolve().parents[3] / "packages" / "test-fixtures" / "snapshots"

# A value per truth state for a single `steps >= 1` style condition. None is a missing signal.
READING: dict[Tri, int | None] = {TRUE: 5, FALSE: 0, UNKNOWN: None}
NAME: dict[Tri, str] = {TRUE: "T", FALSE: "F", UNKNOWN: "U"}
STATES = (TRUE, FALSE, UNKNOWN)


def kleene_all(a: Tri, b: Tri) -> Tri:
    if FALSE in (a, b):
        return FALSE
    return UNKNOWN if UNKNOWN in (a, b) else TRUE


def kleene_any(a: Tri, b: Tri) -> Tri:
    if TRUE in (a, b):
        return TRUE
    return UNKNOWN if UNKNOWN in (a, b) else FALSE


def _snapshot(steps: int | None, wind: int | None) -> Snapshot:
    return Snapshot.from_dict({
        "subject_ref": "sub_tristate",
        "as_of": "2026-09-14",
        "constitution": {"dosha": "vata"},
        "biometrics": {"steps": steps},
        "environment": {"wind_kph": wind},
    })


def _rule(combinator: str) -> Rule:
    return Rule(
        id="t", name="truth table", layer=1, priority=1, effects={},
        when={combinator: [
            {"signal": "steps", "op": "gte", "value": 1},
            {"signal": "wind_kph", "op": "gte", "value": 1},
        ]},
    )


CASES = list(product(STATES, STATES))


def _case_id(case: tuple[Tri, Tri]) -> str:
    return NAME[case[0]] + NAME[case[1]]


@pytest.mark.parametrize("case", CASES, ids=_case_id)
def test_all_is_kleene_conjunction(case: tuple[Tri, Tri]) -> None:
    a, b = case
    verdict, _ = rule_fires(_rule("all"), _snapshot(READING[a], READING[b]), BOOK, [])
    assert verdict is kleene_all(a, b)


@pytest.mark.parametrize("case", CASES, ids=_case_id)
def test_any_is_kleene_disjunction(case: tuple[Tri, Tri]) -> None:
    a, b = case
    verdict, _ = rule_fires(_rule("any"), _snapshot(READING[a], READING[b]), BOOK, [])
    assert verdict is kleene_any(a, b)


def test_a_missing_signal_says_so_in_the_reason() -> None:
    _, reasons = rule_fires(_rule("all"), _snapshot(None, 5), BOOK, [])
    assert "steps not available" in reasons


def test_a_missing_baseline_is_unknown_and_warns() -> None:
    """Baseline-relative ops need a baseline. Without one the condition is UNKNOWN, not FALSE."""
    rule = Rule(id="t", name="t", layer=1, priority=1, effects={},
                when={"all": [{"signal": "hrv_ms", "op": "pct_below_baseline_gte", "value": 20}]})
    snapshot = Snapshot.from_dict({
        "subject_ref": "sub_tristate", "as_of": "2026-09-14", "constitution": {"dosha": "vata"},
        "biometrics": {"hrv_ms": 40}, "baselines": {"hrv_ms": None},
    })
    warnings: list[str] = []
    verdict, _ = rule_fires(rule, snapshot, BOOK, warnings)
    assert verdict is UNKNOWN
    assert any("no baseline available" in w for w in warnings)


def _evaluate_rows(decision: dict[str, Any]) -> dict[str, str]:
    return {r["rule_id"]: r["detail"] for r in decision["trace"] if r["step"] == "evaluate"}


def test_unknown_is_traced_and_false_is_not() -> None:
    """The decision itself keeps the distinction, on the product rulebook.

    The kapha-no-cycle base day: HRV present and near baseline, so 1.1 is FALSE and leaves no row.
    Knock HRV out and 1.1 is UNKNOWN, so it gets an "unevaluable" row and still doesn't fire.
    """
    raw = json.loads((SNAPSHOTS / "kapha-no-cycle.json").read_text(encoding="utf-8"))
    raw = {k: v for k, v in raw.items() if not k.startswith("$")}

    present = decide(Snapshot.from_dict(raw), BOOK)
    assert "1.1" not in _evaluate_rows(present)

    raw["biometrics"] = {**raw["biometrics"], "hrv_ms": None}
    missing = decide(Snapshot.from_dict(raw), BOOK)
    assert _evaluate_rows(missing)["1.1"].startswith("unevaluable")
    assert "1.1" not in [r["rule_id"] for r in missing["fired_rules"]]
