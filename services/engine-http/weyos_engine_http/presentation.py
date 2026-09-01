"""Facts the client needs, projected from the decision. No app state.

The engine emits three states; the product design needs six. This module deliberately does
NOT derive the six, because every plausible mapping silently resolves an open spec question:

* ``calm -> "in balance"`` renders the James gap as reassurance, which is the product defect
  fixture F5 pins. Routing it anywhere else approves candidate rule 1.4 by the back door.
* Splitting ``intervention`` into advisory-vs-intervention needs a severity rule that exists
  nowhere in ``config/rules/`` — a new arbitration rule outside the rulebook.
* ``partial`` versus ``calibrating`` is an undesigned boundary.

So the API returns the engine's own state plus the raw facts a client needs, and the absence
of a ``ui_state`` field is the statement. The demo mapping lives in
``packages/demo-fixtures/app-states.json``, where it is reviewable data with its open
questions attached.

Warning classification happens HERE, in Python, next to the engine — not by prefix-matching
prose in a TypeScript controller. The strings are emitted from five places in ``engine.py``
and ``evaluate.py``; matching them beside their source means the same golden fixtures cover
both. It is still fragile, and the durable fix is a structured ``code`` on warnings, which is
a contract change for a later ADR.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

TRACE_STEP_EVALUATE = "evaluate"
TRACE_UNEVALUABLE = "unevaluable"
TRACE_SUPPRESSED = "suppressed"

WARNING_KINDS: tuple[tuple[str, str], ...] = (
    ("cold_start", "cold start"),
    ("cycle_undefined", "UNDEFINED in rulebook"),
    ("no_baseline", "no baseline available"),
    ("layer2_conflict", "more than one Layer 2 rule fired"),
    ("tag_collision", "per-item substitution is unresolved"),
    ("zscore_fallback", "zscore comparison requested"),
)


def classify_warning(warning: str) -> str:
    for kind, needle in WARNING_KINDS:
        if needle in warning:
            return kind
    return "uncategorised"


def _rule_ids_with_prefix(decision: Mapping[str, Any], prefix: str) -> list[str]:
    out: list[str] = []
    for row in decision["trace"]:
        if row["step"] != TRACE_STEP_EVALUATE:
            continue
        if row["detail"].split(":", 1)[0].strip() == prefix:
            out.append(row["rule_id"])
    return out


def presentation(decision: Mapping[str, Any]) -> dict[str, Any]:
    """Re-projections of facts already inside the decision. No thresholds, no deltas.

    Everything here is enum-ish: layer numbers, rule ids, warning kinds. Nothing is derived by
    comparing a reading to anything — that would be rule logic outside the engine, which the
    CI guardrail exists to catch.
    """
    return {
        "fired_layers": sorted({r["layer"] for r in decision["fired_rules"]}),
        "unevaluable_rule_ids": _rule_ids_with_prefix(decision, TRACE_UNEVALUABLE),
        "suppressed_rule_ids": _rule_ids_with_prefix(decision, TRACE_SUPPRESSED),
        "warning_kinds": sorted({classify_warning(w) for w in decision.get("warnings", [])}),
    }
