"""Layer precedence, L1 > L5 > L2 > L3 > L4, proved for every pair of layers.

The golden fixtures prove precedence where rulebook v1 happens to make two layers collide
(F9, F10, F16). That covers only some pairs. This file runs the arbitration against a test
rulebook, ``fixtures/arbitration.rulebook.yaml``, in which every layer carries the same effects,
so any two layers can be forced to meet on each dimension of the decision.

One dimension does NOT follow precedence today: a lower layer's block suppresses a higher layer's
mandate on the same tag. That is pinned as current behaviour, with a strict xfail beside it, the
same way F5/F5b pin the James gap. It is a spec question and is not resolved here. See F16.
"""

from __future__ import annotations

from itertools import combinations
from pathlib import Path
from typing import Any

import pytest

from weyos_engine.config import Rulebook, load_rulebook
from weyos_engine.engine import FOOD_CHAIN_ORDER, decide
from weyos_engine.models import Snapshot

# The one statement of precedence the tests hold everything else against. Source: CLAUDE.md,
# docs/engine.md and the header of config/rules/rules.v1.yaml, which all say the same thing.
PRECEDENCE: tuple[int, ...] = (1, 5, 2, 3, 4)

ARBITRATION = load_rulebook(Path(__file__).parent / "fixtures" / "arbitration.rulebook.yaml")

# (higher, lower) for every pair. The four adjacent pairs are the acceptance criterion; the other
# six follow by transitivity, and are cheap enough to check anyway rather than assume.
PAIRS = list(combinations(PRECEDENCE, 2))
ADJACENT = list(zip(PRECEDENCE, PRECEDENCE[1:], strict=False))


def _pair_id(pair: tuple[int, int]) -> str:
    return f"L{pair[0]}>L{pair[1]}"


SWITCHES = [c["signal"].removeprefix("lab_") for r in ARBITRATION.rules for c in r.when["all"]]


def _decide(*switches: str, book: Rulebook = ARBITRATION) -> dict[str, Any]:
    unknown = set(switches) - set(SWITCHES)
    assert not unknown, f"no such switch: {unknown}"
    snapshot = Snapshot.from_dict({
        "subject_ref": "sub_arbitrate",
        "as_of": "2026-09-14",
        "constitution": {"dosha": "vata"},
        "labs": {s: {"status": "on" if s in switches else "off"} for s in SWITCHES},
        "planned_activity": {"type": "run", "location": "outdoor"},
        "planned_meals": [],
    })
    return decide(snapshot, book)


def _trace(decision: dict[str, Any]) -> list[str]:
    return [row["detail"] for row in decision["trace"]]


# --------------------------------------------------------------------- the ordering itself


def test_switches_isolate_one_rule_each() -> None:
    """Guard on the harness itself: nothing fires unless switched on, and a switch fires only its rule."""
    assert _decide()["fired_rules"] == []
    for rule, switch in zip(ARBITRATION.rules, SWITCHES, strict=True):
        assert [r["rule_id"] for r in _decide(switch)["fired_rules"]] == [rule.id]


def test_adjacent_pairs_are_the_four_the_spec_names() -> None:
    assert [_pair_id(p) for p in ADJACENT] == ["L1>L5", "L5>L2", "L2>L3", "L3>L4"]


def test_food_chain_is_exactly_reverse_precedence() -> None:
    """The engine encodes precedence a second time, as the food-chain order. They must agree."""
    assert tuple(reversed(FOOD_CHAIN_ORDER)) == PRECEDENCE


@pytest.mark.parametrize("book_name", ["rules.v1", "arbitration"])
def test_priority_bands_follow_layer_precedence(book_name: str) -> None:
    """Every rule in a higher layer has a lower priority number than every rule in a lower one.

    Activity ties and constraint overrides are broken by `priority`, not by `layer`. So if a rule
    were given a priority outside its layer's band, it would outrank or undercut layers above or
    below it with no error at load time. Disabled rules are included: enabling one must not
    reorder anything.
    """
    book = load_rulebook() if book_name == "rules.v1" else ARBITRATION
    for hi, lo in PAIRS:
        hi_worst = max(r.priority for r in book.rules if r.layer == hi)
        lo_best = min(r.priority for r in book.rules if r.layer == lo)
        assert hi_worst < lo_best, (
            f"{book_name}: a Layer {hi} rule has priority {hi_worst}, which does not beat "
            f"Layer {lo}'s best of {lo_best}"
        )


# --------------------------------------------------------------------- dimensions that follow precedence


@pytest.mark.parametrize("pair", PAIRS, ids=_pair_id)
def test_activity_tie_goes_to_the_higher_layer(pair: tuple[int, int]) -> None:
    hi, lo = pair
    decision = _decide(f"l{hi}_act", f"l{lo}_act")
    assert decision["activity"]["verdict"] == "downgrade"
    assert decision["activity"]["decided_by"] == f"L{hi}.act"
    assert decision["activity"]["prescribed"] == f"L{hi} session"


@pytest.mark.parametrize("pair", PAIRS, ids=_pair_id)
def test_higher_block_withdraws_lower_mandate(pair: tuple[int, int]) -> None:
    """The F9 mechanism, for every pair."""
    hi, lo = pair
    decision = _decide(f"l{hi}_block", f"l{lo}_mandate")
    assert "raw" in decision["food"]["blocked_tags"]
    assert "raw" not in decision["food"]["mandated_tags"]
    assert f"block on 'raw' overrides mandate from L{lo}.mandate" in _trace(decision)


@pytest.mark.parametrize("pair", PAIRS, ids=_pair_id)
def test_higher_modifier_and_constraint_win(pair: tuple[int, int]) -> None:
    hi, lo = pair
    decision = _decide(f"l{hi}_mod", f"l{lo}_mod")
    assert decision["food"]["sodium_pct_delta"] == -hi
    assert decision["constraints"]["bedtime"] == f"L{hi}"


@pytest.mark.parametrize("pair", PAIRS, ids=_pair_id)
def test_higher_block_removes_lower_addition(pair: tuple[int, int]) -> None:
    hi, lo = pair
    decision = _decide(f"l{hi}_block", f"l{lo}_add")
    additions = next(m for m in decision["food"]["meals"] if m["slot"] == "additions")
    assert f"L{lo} item" not in [i["name"] for i in additions["items"]]
    assert {"name": f"L{lo} item", "rule_id": f"L{hi}.block", "reason": "blocked tag 'raw'"} \
        in additions["removed"]


@pytest.mark.parametrize("pair", PAIRS, ids=_pair_id)
def test_higher_addition_survives_lower_block_and_is_surfaced(pair: tuple[int, int]) -> None:
    """The F10 ginger mechanism, for every pair: the item stays and the collision is a warning."""
    hi, lo = pair
    decision = _decide(f"l{hi}_add", f"l{lo}_block")
    items = [i["name"] for m in decision["food"]["meals"] for i in m["items"]]
    assert f"L{hi} item" in items
    assert any(f"L{hi} item" in w and f"L{lo}.block" in w for w in decision["warnings"])


# --------------------------------------------------------------------- the dimension that does not


@pytest.mark.parametrize("pair", PAIRS, ids=_pair_id)
def test_lower_block_suppresses_higher_mandate_CURRENT_BEHAVIOUR(pair: tuple[int, int]) -> None:
    """WRONG BY THE PRECEDENCE READING, BUT CURRENT. Pinned so it cannot change silently.

    The food chain runs least authoritative first. A lower layer's block lands in `blocked`
    before the higher layer is reached, and `_resolve_food` then drops any later mandate for a
    blocked tag, whatever layer it comes from. Blocks behave as absolute. Mandates only win
    against blocks from ABOVE them, which is the opposite of precedence. Additions (`add_items`)
    DO follow precedence (test above), so the engine treats two kinds of "put this on the plate"
    differently.

    In rulebook v1 this is reachable: Ovulatory (2.2) mandates raw while Vata (3.1) blocks it,
    and Follicular (2.1) mandates fermented while Pitta (3.2) blocks it. Golden F16.
    """
    hi, lo = pair
    decision = _decide(f"l{hi}_mandate", f"l{lo}_block")
    assert "raw" not in decision["food"]["mandated_tags"]
    assert f"mandate 'raw' suppressed — blocked by L{lo}.block" in _trace(decision)
    assert f"L{hi}.mandate" in [r["rule_id"] for r in decision["fired_rules"]]


@pytest.mark.xfail(
    strict=True,
    reason="OPEN SPEC QUESTION: does a lower layer's block withdraw a higher layer's mandate? "
           "Precedence says no; the engine says yes. Passing means someone answered it in code.",
)
@pytest.mark.parametrize("pair", PAIRS, ids=_pair_id)
def test_higher_mandate_survives_lower_block(pair: tuple[int, int]) -> None:
    hi, lo = pair
    decision = _decide(f"l{hi}_mandate", f"l{lo}_block")
    assert "raw" in decision["food"]["mandated_tags"]
