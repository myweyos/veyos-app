"""Layer 2, the hormonal master-clock: exactly one phase per cycle day.

SCRUM-84 acceptance criteria:

1. Exactly one rule fires per cycle day; menstrual overrides follicular on days 1-5. Covered here.
2. Resolve "in balance is unreachable for users with cycle data" before shipping. This is a
   product definition decision (plan v2 §9.7), NOT resolved here. The last test pins current
   behaviour so that whoever answers it has to touch this file on purpose.

What actually makes menstrual win on days 1-5 is the RANGES, not the priority. 2.4 covers 1-5
and 2.1 starts at 6, so the two never fire together. 2.4's priority of 29 (the rulebook comment
says it "beats 2.1") would not make it override follicular if the ranges ever overlapped. The
engine would fire both, apply both sets of food mandates, and warn. The overlap test below shows
that, so the safety net is the warning and not the priority.
"""

from __future__ import annotations

import copy
import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from weyos_engine.config import Rulebook, load_rulebook
from weyos_engine.engine import decide
from weyos_engine.models import Snapshot

BOOK = load_rulebook()
BASE = json.loads(
    (Path(__file__).resolve().parents[3] / "packages" / "test-fixtures" / "snapshots" / "vata-cycling.json")
    .read_text(encoding="utf-8")
)
MODEL_DAYS = range(1, 29)

# The phase each day belongs to, written out rather than derived from the rulebook, so a change
# to the ranges fails here instead of quietly moving with them.
EXPECTED_PHASE = {
    **{d: "2.4" for d in range(1, 6)},     # Menstrual
    **{d: "2.1" for d in range(6, 14)},    # Follicular
    **{d: "2.2" for d in range(14, 16)},   # Ovulatory
    **{d: "2.3" for d in range(16, 29)},   # Luteal
}


def _on_day(day: int | None, book: Rulebook = BOOK) -> dict[str, Any]:
    """The cycle-tracking base's ordinary day, cycle day changed. No Layer 1 or 5 rule fires."""
    raw = {k: v for k, v in copy.deepcopy(BASE).items() if not k.startswith("$")}
    raw["cycle"] = {**raw["cycle"], "cycle_day": day}
    return decide(Snapshot.from_dict(raw), book)


def _layer2_fired(decision: dict[str, Any]) -> list[str]:
    return [r["rule_id"] for r in decision["fired_rules"] if r["layer"] == 2]


def test_layer2_ranges_partition_the_28_day_model() -> None:
    """Every day 1-28 is claimed by exactly one enabled Layer 2 rule. No gaps, no overlaps."""
    claims: dict[int, list[str]] = {d: [] for d in MODEL_DAYS}
    for rule in BOOK.rules:
        if rule.layer != 2 or not rule.enabled:
            continue
        for condition in rule.when.get("all", []):
            if condition["signal"] == "cycle_day" and condition["op"] == "in_range":
                low, high = condition["value"]
                for day in range(low, high + 1):
                    claims.setdefault(day, []).append(rule.id)
    assert {d: ids for d, ids in claims.items() if len(ids) != 1} == {}


@pytest.mark.parametrize("day", MODEL_DAYS)
def test_exactly_one_layer2_rule_fires(day: int) -> None:
    decision = _on_day(day)
    assert _layer2_fired(decision) == [EXPECTED_PHASE[day]]
    assert not any("more than one Layer 2 rule fired" in w for w in decision["warnings"])


@pytest.mark.parametrize("day", range(1, 6))
def test_menstrual_not_follicular_on_days_1_to_5(day: int) -> None:
    decision = _on_day(day)
    assert _layer2_fired(decision) == ["2.4"]
    assert decision["activity"]["decided_by"] == "2.4"
    assert {"warming", "iron_rich"} <= set(decision["food"]["mandated_tags"])
    assert "fermented" not in decision["food"]["mandated_tags"]


def test_an_overlap_is_warned_about_not_silently_arbitrated() -> None:
    """If a future edit reopened the source doc's 1-13 follicular range, priority would NOT save it.

    Both rules would fire, both sets of food mandates would apply, and the engine would say so.
    This pins the safety net: the warning. It is also why the partition test above exists.
    """
    widened = tuple(
        replace(r, when={"all": [{"signal": "cycle_day", "op": "in_range", "value": [1, 13]}]})
        if r.id == "2.1" else r
        for r in BOOK.rules
    )
    book = replace(BOOK, rules=widened)
    decision = _on_day(3, book)
    assert sorted(_layer2_fired(decision)) == ["2.1", "2.4"]
    assert any("more than one Layer 2 rule fired" in w for w in decision["warnings"])
    # Follicular's mandates leak onto a menstrual day. Priority 29 does not stop that.
    assert "fermented" in decision["food"]["mandated_tags"]


@pytest.mark.parametrize("day", [29, 30, 31, 35, 45])
def test_days_past_28_fire_no_phase_and_say_so(day: int) -> None:
    """Cycle day > 28 is an OPEN SPEC QUESTION (CLAUDE.md). The engine refuses to guess. F13."""
    decision = _on_day(day)
    assert _layer2_fired(decision) == []
    assert any("UNDEFINED" in w for w in decision["warnings"])


@pytest.mark.parametrize("day", MODEL_DAYS)
def test_in_balance_is_unreachable_with_cycle_data_CURRENT_BEHAVIOUR(day: int) -> None:
    """PINNED, NOT ENDORSED. Plan v2 §9.7 / SCRUM-84 AC2. Needs a product definition.

    `calm` ("in balance today") means only the always-on Layer 3 fired. Layer 2 claims every day
    1-28, so a cycle-tracking subject on an otherwise quiet day is always `intervention`. On live
    data that is most female users, every day.

    Whoever answers §9.7 changes this test deliberately. Some candidate answers, none chosen:
    make L2 always-on like L3; exclude L2 from the calm test only when its verdict is `allow`;
    or keep it and design "in balance" as male/no-cycle only. Each one changes which screen
    a cycle-tracking subject sees on an ordinary day.
    """
    assert _on_day(day)["state"] == "intervention"
