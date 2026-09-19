"""Overlay proposed ``value_z`` thresholds onto a rulebook, in memory only.

The rulebook file is never written by this tool. A proposal file (see
``config/rules/proposals/value_z.candidates.yaml``) maps rule id -> signal -> z threshold; the
overlay returns a new Rulebook whose matching conditions carry ``value_z``. Everything else is
the rulebook as loaded.
"""

from __future__ import annotations

import copy
from dataclasses import replace
from pathlib import Path
from typing import Any

import yaml

from weyos_engine.config import Rule, Rulebook


def load_value_z(path: Path) -> dict[str, dict[str, float]]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    conditions = raw.get("conditions") or {}
    out: dict[str, dict[str, float]] = {}
    for rule_id, signals in conditions.items():
        out[str(rule_id)] = {str(signal): float(z) for signal, z in (signals or {}).items()}
    return out


def apply_value_z(book: Rulebook, proposal: dict[str, dict[str, float]]) -> tuple[Rulebook, list[str]]:
    """Return ``(rulebook with value_z applied, notes)``.

    A note is recorded for every proposal entry that matched nothing, so a typo in the
    proposal is visible rather than silently leaving the mode on percent.
    """
    notes: list[str] = []
    seen: set[tuple[str, str]] = set()
    rules: list[Rule] = []
    for rule in book.rules:
        wanted = proposal.get(rule.id)
        if not wanted:
            rules.append(rule)
            continue
        when: dict[str, Any] = copy.deepcopy(rule.when)
        for combinator in ("all", "any"):
            for condition in when.get(combinator) or []:
                signal = condition.get("signal")
                if signal in wanted and str(condition.get("op", "")).startswith("pct_"):
                    condition["value_z"] = wanted[signal]
                    seen.add((rule.id, signal))
        rules.append(replace(rule, when=when))
    for rule_id, signals in proposal.items():
        for signal in signals:
            if (rule_id, signal) not in seen:
                notes.append(f"proposal entry {rule_id}/{signal} matched no baseline-relative condition")
    return replace(book, rules=tuple(rules)), notes
