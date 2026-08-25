"""Rendering. Text for a human, JSON for a diff.

The JSON form carries no wall-clock and no host detail on purpose: two runs of the same
corpus against the same rulebook produce byte-identical output, so ``diff`` across a
proposed rule change shows the effect of the change and nothing else.
"""

from __future__ import annotations

import json
from typing import Any

from .metrics import STATUS_EVALUATED, RunResult
from .questions import Question

CAVEATS = (
    "A fire rate over the synthetic sweep is COVERAGE OF THE INPUT SPACE, not incidence in a "
    "population. The grid is uniform over parameter space; real subjects sit near their own "
    "baseline most days. Never quote these as 'rule X fires on Y% of days'.",
    "The corpus is a cross-section, not a time series. Every snapshot is independent and shares "
    "one as_of date. Nothing here measures persistence, streaks, or day-over-day behaviour.",
    "Cohort composition is an artefact of the axes. The share of non-cycling subjects, the mix of "
    "doshas and the lab profiles were chosen by the grid, and they move every rate that depends "
    "on them.",
    "Two denominators are reported for every rule and neither is endorsed: 'rate' is over all "
    "snapshots, 'eval-rate' is over snapshots where the rule actually resolved TRUE or FALSE.",
    "Disabled and suppressed rules show null rates, not 0%. They were never asked.",
    "Layer 4 rules cannot co-fire under the stock grids. Environment is swept as one-hot named "
    "profiles (mild / heatwave / full_moon / autumn_wind), so 4.1+4.2 reads as mutually exclusive "
    "when in reality a heat-wave can land on a full moon. That exclusivity is an artefact of this "
    "generator, NOT a property of the rulebook — override with --axis env_profile=... to test it.",
)


def _rate(value: float | None) -> str:
    return "  n/a" if value is None else f"{value * 100:5.1f}%"


def _verdict(count: int | None, label: str) -> str:
    return "OK" if not count else f"{label} on {count}"


def _bar(value: float | None, width: int = 18) -> str:
    if value is None:
        return "-" * 0
    filled = int(round(value * width))
    return "#" * filled + "." * (width - filled)


def render_text(result: RunResult, questions: list[Question], observations: list[Question]) -> str:
    lines: list[str] = []
    add = lines.append

    add("=" * 104)
    add("WEYOS RULEBOOK BACKTEST")
    add("=" * 104)
    add(f"corpus            : {result.corpus_label}")
    add(f"snapshots         : {result.total}")
    add(f"rulebook version  : v{result.rulebook_version}")
    add(f"comparison mode   : {result.comparison_mode}")
    add(f"elemental layer   : {'on' if result.elemental_layer_enabled else 'OFF (validated-only)'}")
    for key, value in sorted(result.meta.items()):
        add(f"{key:<18}: {value}")
    if result.errors:
        add(f"load errors       : {len(result.errors)} (listed at the end)")

    add("")
    add("-" * 104)
    add("HOW TO READ THIS")
    add("-" * 104)
    for caveat in CAVEATS:
        add(f"  ! {_wrap(caveat, 98, '      ')}")

    # ------------------------------------------------------------------ per-rule
    add("")
    add("-" * 104)
    add("PER-RULE FIRING")
    add("-" * 104)
    add(f"{'rule':<6}{'L':<3}{'name':<34}{'status':<11}{'fired':>8}{'rate':>8}{'eval-rate':>11}{'unevaluable':>13}")
    add("-" * 104)
    for stat in result.rules:
        add(
            f"{stat.rule_id:<6}{stat.layer:<3}{stat.name[:33]:<34}{stat.status:<11}"
            f"{stat.fired:>8}{_rate(stat.fire_rate):>8}{_rate(stat.evaluable_fire_rate):>11}"
            f"{stat.unevaluable:>13}"
        )

    evaluated = [s for s in result.rules if s.status == STATUS_EVALUATED]
    if evaluated:
        add("")
        add("fire rate (share of all snapshots)")
        for stat in evaluated:
            add(f"  {stat.rule_id:<5} {_bar(stat.fire_rate)}  {_rate(stat.fire_rate)}")

    never = [s for s in evaluated if s.fired == 0]
    if never:
        add("")
        add(f"  NOTE: evaluated but never fired on this corpus: {', '.join(s.rule_id for s in never)}")
        add("        That is a statement about the corpus, not about the rule.")

    # ------------------------------------------------------------------ co-firing
    add("")
    add("-" * 104)
    add("CO-FIRING")
    add("-" * 104)
    fired_ids = [s.rule_id for s in result.rules if result.cofiring.fired.get(s.rule_id, 0) > 0]

    if not fired_ids:
        add("  no rule fired on this corpus")
    else:
        add("P(column fired | row fired), percent. '.' = never together, '-' = row never fired.")
        add("")
        header = "      " + "".join(f"{rid:>6}" for rid in fired_ids)
        add(header)
        for a in fired_ids:
            cells = []
            for b in fired_ids:
                if a == b:
                    cells.append(f"{'--':>6}")
                    continue
                value = result.cofiring.conditional(a, b)
                if value is None:
                    cells.append(f"{'-':>6}")
                elif value == 0:
                    cells.append(f"{'.':>6}")
                else:
                    cells.append(f"{value * 100:>5.0f} ")
            add(f"{a:<6}" + "".join(cells))

        add("")
        add("strongest co-firing pairs (by count)")
        pairs = sorted(result.cofiring.pairs.items(), key=lambda kv: (-kv[1], kv[0]))
        if not pairs:
            add("  (no rule ever fired alongside another)")
        for (a, b), count in pairs[:15]:
            add(
                f"  {a:<5} + {b:<5} {count:>8}  "
                f"({result.cofiring.rate(a, b) or 0:6.1%} of all)  "
                f"P({b}|{a})={_rate(result.cofiring.conditional(a, b))}  "
                f"P({a}|{b})={_rate(result.cofiring.conditional(b, a))}  "
                f"jaccard={_rate(result.cofiring.jaccard(a, b))}"
            )

        mutually_exclusive = [
            (a, b)
            for i, a in enumerate(fired_ids)
            for b in fired_ids[i + 1 :]
            if result.cofiring.count(a, b) == 0
        ]
        if mutually_exclusive:
            add("")
            add("never co-fired on this corpus")
            add("  " + ", ".join(f"{a}+{b}" for a, b in mutually_exclusive[:24]))
            if len(mutually_exclusive) > 24:
                add(f"  ... and {len(mutually_exclusive) - 24} more pairs")

    # ------------------------------------------------------------------ distributions
    add("")
    add("-" * 104)
    add("OUTCOME DISTRIBUTIONS")
    add("-" * 104)
    add("decision state")
    for state, count in sorted(result.states.items(), key=lambda kv: -kv[1]):
        add(f"  {state:<24}{count:>8}  {count / result.total:6.1%}" if result.total else f"  {state}")
    add("")
    add("activity verdict")
    for verdict, count in sorted(result.activity_verdicts.items(), key=lambda kv: -kv[1]):
        add(f"  {verdict:<24}{count:>8}  {count / result.total:6.1%}" if result.total else f"  {verdict}")
    add("")
    add("activity decided by")
    for rule_id, count in sorted(result.activity_decided_by.items(), key=lambda kv: -kv[1]):
        add(f"  {rule_id:<24}{count:>8}  {count / result.total:6.1%}" if result.total else f"  {rule_id}")

    # ------------------------------------------------------------------ warnings
    add("")
    add("-" * 104)
    add("ENGINE WARNINGS (by category — raw text is never reprinted, it interpolates subject values)")
    add("-" * 104)
    if not result.warnings:
        add("  (none)")
    for category, count in sorted(result.warnings.items(), key=lambda kv: -kv[1]):
        add(f"  {category:<28}{count:>8}")

    # ------------------------------------------------------------------ invariants
    add("")
    add("-" * 104)
    add("INVARIANTS")
    add("-" * 104)
    multi = result.invariants.multi_fire
    silent = result.invariants.l3_silent
    add(f"  layer 2 'exactly one fires'       : {_verdict(multi.get(2), 'VIOLATED')}")
    add(f"  layer 3 one dosha rule per subject: {_verdict(multi.get(3), 'VIOLATED')}")
    add(f"  layer 3 always fired              : {_verdict(silent, 'SILENT')}")
    add(
        f"  unevaluable with no warning       : {result.invariants.unevaluable_without_warning}"
        f"  (docs/engine.md says these should carry one — see observations)"
    )

    # ------------------------------------------------------------------ questions
    add("")
    add("=" * 104)
    add("OPEN SPEC QUESTIONS TOUCHED BY THIS RUN — NOT RESOLVED HERE")
    add("=" * 104)
    add("Per CLAUDE.md these must not be silently resolved in code. The harness reports what it")
    add("observed and stops. Each needs a human decision.")
    _render_questions(add, questions)

    if observations:
        add("")
        add("=" * 104)
        add("NEW OBSERVATIONS FROM THIS HARNESS — NOT YET TRACKED IN CLAUDE.md")
        add("=" * 104)
        _render_questions(add, observations)

    # ------------------------------------------------------------------ errors
    if result.errors:
        add("")
        add("-" * 104)
        add("LOAD ERRORS (structural detail only — never a value)")
        add("-" * 104)
        for error in result.errors[:40]:
            add(f"  [{error.kind}] {error.path}: {error.detail}")
        if len(result.errors) > 40:
            add(f"  ... and {len(result.errors) - 40} more")

    return "\n".join(lines)


def _render_questions(add: Any, questions: list[Question]) -> None:
    for index, question in enumerate(questions, start=1):
        add("")
        add(f"{index}. {question.title}")
        add(f"   id     : {question.id}")
        add(f"   source : {question.source}")
        add(f"   detail : {_wrap(question.detail, 92, '            ')}")
        for item in question.evidence:
            add(f"   • {_wrap(item, 92, '     ')}")


def _wrap(text: str, width: int, indent: str) -> str:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        if current and len(current) + 1 + len(word) > width:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        lines.append(current)
    return f"\n{indent}".join(lines)


def render_json(
    result: RunResult,
    questions: list[Question],
    observations: list[Question],
) -> str:
    payload: dict[str, Any] = result.to_dict()
    payload["caveats"] = list(CAVEATS)
    payload["open_spec_questions"] = [q.to_dict() for q in questions]
    payload["new_observations"] = [q.to_dict() for q in observations]
    return json.dumps(payload, indent=2, sort_keys=True)
