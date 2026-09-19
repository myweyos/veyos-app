"""Percent vs z-score, snapshot by snapshot (SCRUM-74).

Runs the same corpus through the rulebook in both comparison modes and reports, per
baseline-relative rule, how often the two modes agree and which way they disagree. The report
carries counts and rule ids only, never a reading.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field, replace
from typing import Any

from weyos_engine.config import Rulebook

from .runner import Corpus, SnapshotOutcome, iter_outcomes


def baseline_relative_rules(book: Rulebook) -> list[str]:
    out: list[str] = []
    for rule in book.rules:
        for combinator in ("all", "any"):
            for condition in rule.when.get(combinator) or []:
                if str(condition.get("op", "")).startswith("pct_"):
                    out.append(rule.id)
                    break
            else:
                continue
            break
    return out


@dataclass
class RuleDisagreement:
    rule_id: str
    both_fired: int = 0
    neither: int = 0
    percent_only: int = 0
    zscore_only: int = 0
    # Where the modes disagree, which variability profile the snapshot came from. Diagnostic:
    # if every disagreement sits off "stock", the candidates are calibrated as intended.
    by_variability: dict[str, dict[str, int]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(int))
    )

    @property
    def total(self) -> int:
        return self.both_fired + self.neither + self.percent_only + self.zscore_only

    @property
    def agreement(self) -> float:
        return 0.0 if self.total == 0 else (self.both_fired + self.neither) / self.total


@dataclass
class Comparison:
    total: int
    rules: list[RuleDisagreement]
    state_changed: int
    verdict_changed: int
    zscore_fallbacks: int
    notes: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "state_changed": self.state_changed,
            "verdict_changed": self.verdict_changed,
            "zscore_fallbacks": self.zscore_fallbacks,
            "notes": self.notes,
            "rules": [
                {
                    "rule_id": r.rule_id,
                    "both_fired": r.both_fired,
                    "neither": r.neither,
                    "percent_only": r.percent_only,
                    "zscore_only": r.zscore_only,
                    "agreement": round(r.agreement, 4),
                    "disagreements_by_variability": {
                        k: dict(v) for k, v in sorted(r.by_variability.items())
                    },
                }
                for r in self.rules
            ],
        }


def _variability_of(raw: dict[str, Any]) -> str:
    """Recover the generator's variability profile from the SD ratio. 'other' for real data."""
    b = raw.get("baselines") or {}
    hrv, sd = b.get("hrv_ms"), b.get("hrv_sd")
    if not hrv or sd is None:
        return "other"
    cv = round(float(sd) / float(hrv), 3)
    return {0.1: "stock", 0.05: "steady", 0.2: "variable"}.get(cv, "other")


def compare_modes(
    book: Rulebook,
    items: list[tuple[str, dict[str, Any]]],
    *,
    elemental_layer: bool | None,
    notes: list[str],
) -> Comparison:
    percent_book = replace(book, baseline={**book.baseline, "comparison_mode": "percent"})
    zscore_book = replace(book, baseline={**book.baseline, "comparison_mode": "zscore"})

    def run(b: Rulebook) -> dict[str, SnapshotOutcome]:
        corpus = Corpus(label="compare", items=list(items))
        return {o.snapshot_id: o for o in iter_outcomes(b, corpus, elemental_layer=elemental_layer)}

    p = run(percent_book)
    z = run(zscore_book)
    variability = {sid: _variability_of(raw) for sid, raw in items}

    rules = {rid: RuleDisagreement(rid) for rid in baseline_relative_rules(book)}
    state_changed = verdict_changed = fallbacks = 0
    for sid, po in p.items():
        zo = z.get(sid)
        if zo is None:
            continue
        if po.state != zo.state:
            state_changed += 1
        if po.activity_verdict != zo.activity_verdict:
            verdict_changed += 1
        fallbacks += sum(1 for w in zo.warnings if "zscore comparison requested" in w)
        for rid, rd in rules.items():
            a, b = rid in po.fired, rid in zo.fired
            if a and b:
                rd.both_fired += 1
            elif not a and not b:
                rd.neither += 1
            elif a:
                rd.percent_only += 1
                rd.by_variability[variability[sid]]["percent_only"] += 1
            else:
                rd.zscore_only += 1
                rd.by_variability[variability[sid]]["zscore_only"] += 1

    return Comparison(
        total=len(p),
        rules=list(rules.values()),
        state_changed=state_changed,
        verdict_changed=verdict_changed,
        zscore_fallbacks=fallbacks,
        notes=notes,
    )


def render_comparison(c: Comparison, label: str) -> str:
    lines = [
        "WEYOS RULEBOOK BACKTEST — percent vs z-score",
        f"corpus             : {label}",
        f"snapshots          : {c.total}",
        f"state changed      : {c.state_changed}",
        f"verdict changed    : {c.verdict_changed}",
        f"z-score fallbacks  : {c.zscore_fallbacks}   (conditions with no value_z or no SD; percent used)",
        "",
        f"{'rule':<6}{'both':>8}{'neither':>9}{'%-only':>8}{'z-only':>8}{'agree':>8}"
        "   disagreements by variability",
    ]
    for r in c.rules:
        by = "; ".join(
            f"{k}: " + ", ".join(f"{kk}={vv}" for kk, vv in sorted(v.items()))
            for k, v in sorted(r.by_variability.items())
        )
        lines.append(
            f"{r.rule_id:<6}{r.both_fired:>8}{r.neither:>9}{r.percent_only:>8}{r.zscore_only:>8}"
            f"{r.agreement * 100:>7.1f}%   {by or '-'}"
        )
    if c.notes:
        lines.append("")
        lines.extend(f"NOTE: {n}" for n in c.notes)
    return "\n".join(lines)
