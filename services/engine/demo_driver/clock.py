"""The deterministic day-clock.

Not a clock in the wall-time sense — it never reads one. It is a pure function from
``(scenario, day_index)`` to the derived per-day fields, so scenarios do not have to restate
``as_of``, ``cycle_day`` and ``days_of_history`` on every entry.

The value object holds ``(scenario_id, day_index)`` and nothing else. Because it carries no
accumulated state, ``reset`` is trivially correct and reaching day *n* by *n* ticks must
produce a byte-identical snapshot to jumping straight there. ``tests/test_demo_fixtures.py``
asserts both.

CLAUDE.md rule 1 bans the engine from reading the current time. Date *arithmetic* on a date
supplied by a scenario file is not that — ``start_date`` comes from data, never from the
system. The clock also lives in the driver, never in ``weyos_engine``. A source-level test
asserts this package contains no ``datetime.now`` / ``date.today`` / ``time.time`` /
``random``.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date, timedelta

# The rulebook's Layer 2 covers cycle days 1-28 and nothing beyond. Day 29+ is UNDEFINED and
# is on CLAUDE.md's do-not-resolve list, so the clock refuses to go there rather than
# wrapping to 1 and quietly inventing an answer inside a helper function.
CYCLE_MAX_DAY = 28


class UndefinedCycleDay(ValueError):
    """A scenario ran the cycle past day 28.

    Always fatal. Wrapping would resolve an open spec question; guessing a cycle length would
    invent a rule. The scenario author has to say what they mean.
    """


@dataclass(frozen=True)
class DayClock:
    """Where a scenario has got to. Immutable, and carries no derived state."""

    scenario_id: str
    day_index: int = 0

    def __post_init__(self) -> None:
        if self.day_index < 0:
            raise ValueError(f"day_index must be >= 0, got {self.day_index}")


def advance(clock: DayClock, days: int = 1) -> DayClock:
    return replace(clock, day_index=clock.day_index + days)


def reset(clock: DayClock) -> DayClock:
    return replace(clock, day_index=0)


def as_of_for(start_date: str, day_index: int) -> str:
    """ISO date `day_index` days after the scenario's start."""
    return (date.fromisoformat(start_date) + timedelta(days=day_index)).isoformat()


def cycle_day_for(start_cycle_day: int | None, day_index: int) -> int | None:
    """Advance the cycle day, or refuse.

    Returns None for a subject with no cycle tracking — which is a different thing from day
    zero, and the engine treats it as UNKNOWN rather than false.
    """
    if start_cycle_day is None:
        return None
    day = start_cycle_day + day_index
    if day > CYCLE_MAX_DAY:
        raise UndefinedCycleDay(
            f"scenario reached cycle_day {day}; rulebook Layer 2 is undefined past day "
            f"{CYCLE_MAX_DAY}. Patch `cycle` explicitly on that day and say what you intend — "
            f"the clock will not wrap, because wrapping would answer an open spec question."
        )
    return day
