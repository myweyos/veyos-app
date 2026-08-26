"""Demo driver for the scripted personas.

Feeds ``packages/demo-fixtures`` through the real engine and derives the six product app
states from the Decision's three. Dev/demo only — nothing here ships in a production build,
and nothing here is imported by ``weyos_engine``.

Three properties this package is held to, each with a test:

1. **It never reaches inside the engine.** It imports exactly ``decide``, ``Snapshot`` and
   ``load_rulebook`` — the same public triple ``backtest/runner.py`` uses.
2. **It reads no clock and no RNG.** Date arithmetic on a date supplied by a scenario file
   is fine; ``date.today()`` is not.
3. **It decides nothing.** The 3-to-6 app-state mapping lives in
   ``packages/demo-fixtures/app-states.json`` as reviewable data, with its open questions
   attached. This package walks that file; it does not encode the mapping.
"""

from __future__ import annotations

from .app_state import derive_app_state, load_app_states, unevaluable_rule_ids
from .clock import CYCLE_MAX_DAY, DayClock, UndefinedCycleDay, advance, as_of_for, cycle_day_for, reset
from .driver import (
    PERSONA_IDS,
    DayResult,
    build_snapshot,
    decide_day,
    layer_map,
    load_personas,
    load_profile,
    load_scenario,
    run_scenario,
    snapshot_at,
    write_expected,
)

__all__ = [
    "CYCLE_MAX_DAY",
    "PERSONA_IDS",
    "DayClock",
    "DayResult",
    "UndefinedCycleDay",
    "advance",
    "as_of_for",
    "build_snapshot",
    "cycle_day_for",
    "decide_day",
    "derive_app_state",
    "layer_map",
    "load_app_states",
    "load_personas",
    "load_profile",
    "load_scenario",
    "reset",
    "run_scenario",
    "snapshot_at",
    "unevaluable_rule_ids",
    "write_expected",
]
