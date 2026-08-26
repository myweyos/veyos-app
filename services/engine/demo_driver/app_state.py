"""Deriving the six app states from a three-state Decision.

The engine emits ``calm | intervention | insufficient_baseline``. The product design needs
six: calibrating, partial, in balance, advisory, intervention, declined. That mapping is not
a detail — it decides what a user is told — and several of its edges are open spec questions.

So the mapping is **data**, not code. ``packages/demo-fixtures/app-states.json`` holds the
ordered state list, the predicate each state uses, and an ``open_questions`` block. This
module implements the named predicates and walks the list; it does not decide anything. Add a
state or reorder the priority by editing the JSON, never by editing this file.

That is the same discipline ``backtest/questions.py`` uses: the question is resolved *loudly*,
in a file whose entire purpose is to be signed off, rather than silently in an ``if``.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from weyos_engine.config import REPO_ROOT

APP_STATES_PATH = REPO_ROOT / "packages" / "demo-fixtures" / "app-states.json"

TRACE_STEP_EVALUATE = "evaluate"
TRACE_UNEVALUABLE = "unevaluable"
BIOMETRIC_LAYER = 1


class AppStateError(ValueError):
    """The mapping file and this module disagree. Always fatal."""


def load_app_states(path: Path = APP_STATES_PATH) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    known = set(PREDICATES)
    for state in data["states"]:
        if state["predicate"] not in known:
            raise AppStateError(
                f"app-states.json state '{state['id']}' names predicate "
                f"'{state['predicate']}', which this module does not implement. "
                f"Known: {sorted(known)}"
            )
    return data


def unevaluable_rule_ids(decision: Mapping[str, Any]) -> list[str]:
    """Rule ids whose conditions came out UNKNOWN, recovered from the engine's own trace."""
    out: list[str] = []
    for row in decision["trace"]:
        if row["step"] != TRACE_STEP_EVALUATE:
            continue
        if row["detail"].split(":", 1)[0].strip() == TRACE_UNEVALUABLE:
            out.append(row["rule_id"])
    return out


# --------------------------------------------------------------------------- predicates
# Each takes (decision, client, layer_of) and returns a bool. Named in app-states.json.


def _user_declined(
    decision: Mapping[str, Any], client: Mapping[str, Any], layer_of: Mapping[str, int]
) -> bool:
    return client.get("user_response") == "declined"


def _engine_state_is_insufficient_baseline(
    decision: Mapping[str, Any], client: Mapping[str, Any], layer_of: Mapping[str, int]
) -> bool:
    return bool(decision["state"] == "insufficient_baseline")


def _engine_state_is_intervention_and_activity_restricted(
    decision: Mapping[str, Any], client: Mapping[str, Any], layer_of: Mapping[str, int]
) -> bool:
    return bool(decision["state"] == "intervention" and decision["activity"]["verdict"] != "allow")


def _has_unevaluable_biometric_rules(
    decision: Mapping[str, Any], client: Mapping[str, Any], layer_of: Mapping[str, int]
) -> bool:
    """A Layer 1 rule could not be evaluated.

    Restricted to Layer 1 deliberately, and it is the most contested line in this file. The
    engine maps an ABSENT signal to UNKNOWN identically to one that failed to sync, so a
    subject with no cycle has 2.1-2.4 unevaluable every day and a subject with no labs has
    5.1-5.3 unevaluable every day. Counting those would make every non-cycling subject
    permanently 'partial' and would make 'in balance' unreachable for them — deleting
    fixtures F2 and F5 from the demo. See app-states.json, open question
    'partial-is-narrowed-to-layer-1'. This narrowing makes the demo correct; it does not
    solve the modelling gap.
    """
    return any(layer_of.get(rid) == BIOMETRIC_LAYER for rid in unevaluable_rule_ids(decision))


def _engine_state_is_intervention(
    decision: Mapping[str, Any], client: Mapping[str, Any], layer_of: Mapping[str, int]
) -> bool:
    return bool(decision["state"] == "intervention")


def _engine_state_is_calm(
    decision: Mapping[str, Any], client: Mapping[str, Any], layer_of: Mapping[str, int]
) -> bool:
    return bool(decision["state"] == "calm")


PREDICATES: dict[str, Any] = {
    "user_declined": _user_declined,
    "engine_state_is_insufficient_baseline": _engine_state_is_insufficient_baseline,
    "engine_state_is_intervention_and_activity_restricted": (
        _engine_state_is_intervention_and_activity_restricted
    ),
    "has_unevaluable_biometric_rules": _has_unevaluable_biometric_rules,
    "engine_state_is_intervention": _engine_state_is_intervention,
    "engine_state_is_calm": _engine_state_is_calm,
}


def derive_app_state(
    decision: Mapping[str, Any],
    layer_of: Mapping[str, int],
    client: Mapping[str, Any] | None = None,
    app_states: Mapping[str, Any] | None = None,
) -> str:
    """First match wins, reading app-states.json top to bottom.

    ``layer_of`` maps rule id to layer and comes from the rulebook, so nothing here parses a
    rule id string to guess its layer.
    """
    states = app_states or load_app_states()
    ctx = client or {}
    for state in states["states"]:
        if PREDICATES[state["predicate"]](decision, ctx, layer_of):
            return str(state["id"])
    raise AppStateError(
        f"no app state matched a decision in engine state {decision['state']!r}. "
        f"app-states.json must be exhaustive over the engine's three states."
    )
