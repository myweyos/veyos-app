"""Backtest harness for the Veyos rulebook.

Runs the *existing* rulebook over a corpus of snapshots and reports, per rule, how often
it fired and which other rules it fired alongside. It is a measurement instrument: it does
not modify ``config/rules/rules.v1.yaml``, it does not enable disabled rules, and it does
not pick an answer to any of the open spec questions in ``CLAUDE.md``. Where a run bumps
into one of those questions, the harness *raises* it in the report (see ``questions.py``).

Read ``backtest/README.md`` before trusting a number out of this thing — in particular the
part about why a fire rate over a synthetic sweep is coverage, not incidence.
"""

from __future__ import annotations

from .generate import GRIDS, Axes, generate
from .metrics import CoFiring, RuleStats, RunResult, aggregate
from .runner import LoadError, SnapshotOutcome, iter_outcomes, load_directory

__all__ = [
    "GRIDS",
    "Axes",
    "CoFiring",
    "LoadError",
    "RuleStats",
    "RunResult",
    "SnapshotOutcome",
    "aggregate",
    "generate",
    "iter_outcomes",
    "load_directory",
]
