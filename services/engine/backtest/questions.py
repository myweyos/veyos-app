"""Open spec questions the harness bumps into — raised, never answered.

CLAUDE.md is explicit: *"Known open spec questions — do NOT silently resolve these in
code."* A backtest is exactly the kind of tool that resolves them by accident, because
picking a comparison mode or a denominator in order to produce a number looks like an
implementation detail right up until someone quotes the number in a decision.

So the harness does the opposite. Every run ends with this section: the questions the run
touched, what the run can and cannot say about each, and — where the answer is structurally
unobtainable — why. ``STATIC`` holds the questions already tracked in CLAUDE.md and the
rulebook; ``OBSERVATIONS`` holds things this harness noticed that are not yet written down
anywhere.

Nothing in here changes engine behaviour. It is report text with counters attached.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from veyos_engine.config import Rulebook

from .metrics import STATUS_DISABLED, STATUS_SUPPRESSED, RunResult


@dataclass
class Question:
    id: str
    title: str
    source: str
    detail: str
    evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "source": self.source,
            "detail": self.detail,
            "evidence": list(self.evidence),
        }


def count_conditions_with_value_z(book: Rulebook) -> int:
    """How many rule conditions actually carry a z-score threshold."""
    found = 0
    for rule in book.rules:
        for key in ("all", "any"):
            for condition in rule.when.get(key, []) or []:
                if "value_z" in condition:
                    found += 1
    return found


def _pct(part: int, whole: int) -> str:
    return f"{part}/{whole} ({part / whole * 100:.1f}%)" if whole else f"{part}/0"


def raise_questions(book: Rulebook, result: RunResult) -> list[Question]:
    """Build the report's question list, attaching whatever this run observed."""
    stats = result.by_id()
    total = result.total
    questions: list[Question] = []

    # ---------------------------------------------------------------- percent vs z-score
    z_conditions = count_conditions_with_value_z(book)
    q = Question(
        id="percent-vs-zscore",
        title="Percentage-below-baseline vs z-score comparison",
        source="CLAUDE.md; config/rules/rules.v1.yaml (baseline.comparison_mode)",
        detail=(
            "The rulebook is written in % below baseline; the patent recites "
            "(current - trailing_ma) / historical_sd. The rulebook says the default is to be "
            "decided on backtest evidence. THIS BACKTEST CANNOT SUPPLY THAT EVIDENCE YET — see below."
        ),
    )
    if z_conditions == 0:
        q.evidence.append(
            f"No rule condition in rulebook v{book.version} defines `value_z` "
            f"({z_conditions} found across all rules)."
        )
        q.evidence.append(
            "evaluate.py:_baseline_op falls back to the percent comparison whenever `value_z` is "
            "absent, and warns. So running with comparison_mode: zscore produces the SAME fired "
            "set as percent, plus a pile of fallback warnings."
        )
        q.evidence.append(
            "Consequence: the two modes are not currently distinguishable by any backtest. "
            "Someone has to author z-score thresholds per condition before this question can be "
            "answered with evidence. The harness will not invent them."
        )
    else:
        q.evidence.append(f"{z_conditions} condition(s) define `value_z` — a real comparison is possible.")
    fallbacks = result.warnings.get("zscore_fallback", 0)
    if fallbacks:
        q.evidence.append(f"This run emitted {fallbacks} z-score fallback warning(s).")
    questions.append(q)

    # ---------------------------------------------------------------- rule 1.2 measurement
    s12 = stats.get("1.2")
    q = Question(
        id="rule-1.2-sleep-measurement",
        title="Rule 1.2 reads deep/REM stage % — the personas supply a composite sleep score",
        source="CLAUDE.md; config/rules/rules.v1.yaml (rule 1.2)",
        detail=(
            "Different measurements with different platform availability. The schema carries "
            "sleep_score as display-only and forbids rules from reading it, so this sweep drives "
            "sleep_deep_rem_pct exclusively."
        ),
    )
    if s12 is not None:
        q.evidence.append(
            f"1.2 fired on {_pct(s12.fired, total)} of this corpus, measured against the STAGE "
            f"percentage. That number would not carry over to a composite-score reading."
        )
        if s12.unevaluable:
            q.evidence.append(
                f"1.2 was unevaluable on {_pct(s12.unevaluable, total)} — no stage percentage present."
            )
        else:
            q.evidence.append(
                "This grid supplies a stage percentage on every snapshot, so the unevaluable rate "
                "for 1.2 is 0 by construction. Use --grid fine (which includes a null sleep axis "
                "point) to measure the Alex case, where the composite exists and the stage % does not."
            )
    questions.append(q)

    # ---------------------------------------------------------------- the James gap / rule 1.4
    s14 = stats.get("1.4")
    calm = result.states.get("calm", 0)
    q = Question(
        id="rule-1.4-cardiovascular-load",
        title="No rule fires on elevated RHR alone (the James gap)",
        source="CLAUDE.md; docs/engine.md fixtures F5 / F5b",
        detail=(
            "1.3 is dual-gated on temperature AND RHR, so a large isolated RHR rise produces no L1 "
            "rule and the app reports 'in balance today'. Candidate rule 1.4 is proposed and "
            "UNAPPROVED."
        ),
    )
    if s14 is not None and s14.status == STATUS_DISABLED:
        q.evidence.append(
            "1.4 is enabled: false in the rulebook. The harness did NOT enable it — its counts are "
            "reported as status=disabled with null rates, not as a 0% fire rate."
        )
    q.evidence.append(
        f"{_pct(calm, total)} of this corpus resolved to state=calm, i.e. only always-on Layer 3 "
        f"fired. Read that number against F5 before treating calm as reassurance."
    )
    q.evidence.append(
        "To size 1.4's effect, someone with sign-off must enable it in the rulebook and re-run. "
        "That is a rulebook change and therefore out of scope for this tool."
    )
    questions.append(q)

    # ---------------------------------------------------------------- cycle day > 28
    undefined = result.warnings.get("cycle_day_undefined", 0)
    q = Question(
        id="cycle-day-over-28",
        title="cycle_day > 28 is undefined",
        source="CLAUDE.md; docs/engine.md fixture F13",
        detail="No Layer 2 rule covers day 29+. The engine warns and fires nothing from L2.",
    )
    q.evidence.append(
        f"{undefined} snapshot(s) in this run tripped the undefined-cycle-day warning."
        + (
            " The stock grids stop at day 28, so this is 0 by construction — pass an explicit "
            "--cycle-day axis including 29+ to measure it."
            if undefined == 0
            else ""
        )
    )
    questions.append(q)

    # ---------------------------------------------------------------- cold start
    cold = result.warnings.get("cold_start", 0)
    questions.append(
        Question(
            id="cold-start",
            title="Cold start (4–8 weeks with no baseline) is under-designed",
            source="CLAUDE.md; docs/engine.md fixture F12",
            detail="Below min_days_for_baseline the engine degrades to insufficient_baseline.",
            evidence=[
                f"{cold} snapshot(s) tripped the cold-start warning.",
                "The synthetic generator pins days_of_history at 90 so baseline-relative rules are "
                "exercised rather than short-circuited. Cold-start behaviour needs its own corpus; "
                "this harness does not currently sweep days_of_history.",
            ],
        )
    )

    # ---------------------------------------------------------------- ginger for a Pitta
    collisions = result.warnings.get("l1_addition_collision", 0)
    questions.append(
        Question(
            id="ginger-for-a-pitta",
            title="L1 additions collide with lower-layer blocks; per-item substitution unresolved",
            source="CLAUDE.md; docs/engine.md fixture F10",
            detail=(
                "L1's immunity basket mandates warming ginger while L3 Pitta blocks hot/spicy. L1 "
                "wins by precedence and the engine surfaces a warning rather than substituting."
            ),
            evidence=[
                f"{_pct(collisions, total)} of snapshots produced an L1-addition collision warning.",
                "That is how often a user would be shown an item their own constitution rule just "
                "blocked. It is a UI-facing frequency, not an engine defect.",
            ],
        )
    )

    # ---------------------------------------------------------------- 4.2 in validated-only mode
    s42 = stats.get("4.2")
    q = Question(
        id="rule-4.2-validated-only",
        title="Heat-wave (4.2) is environmental safety but is suppressed in validated-only mode",
        source="config/rules/rules.v1.yaml (features.validated_only_layers) — flagged for JB",
        detail=(
            "Options recorded in the rulebook: (a) accept, it is a demo mode; (b) promote 4.2 into "
            "L1 as a safety rule. Explicitly marked 'Do not resolve this in code'."
        ),
    )
    if s42 is not None:
        if s42.status == STATUS_SUPPRESSED:
            q.evidence.append(
                f"This run had the elemental layer OFF: 4.2 was suppressed on {_pct(s42.suppressed, total)} "
                f"of snapshots and could not contribute a relocate verdict."
            )
        else:
            q.evidence.append(
                f"This run had the elemental layer ON: 4.2 fired on {_pct(s42.fired, total)}. "
                f"Re-run with --no-elemental to size what validated-only mode gives up."
            )
    questions.append(q)

    # ---------------------------------------------------------------- pollen / AQI
    s44 = stats.get("4.4")
    if s44 is not None and s44.status == STATUS_DISABLED:
        questions.append(
            Question(
                id="pollen-air-quality",
                title="Pollen / air quality is not a signal in the model",
                source="CLAUDE.md; config/rules/rules.v1.yaml (candidate rule 4.4)",
                detail=(
                    "Candidate 4.4 exists but is enabled: false; pollen_index and aqi are carried, "
                    "unread."
                ),
                evidence=["4.4 reported as status=disabled — not evaluated, not a measured 0% fire rate."],
            )
        )

    return questions


def raise_observations(book: Rulebook, result: RunResult) -> list[Question]:
    """Things this harness noticed that are NOT yet tracked in CLAUDE.md.

    Separated from ``raise_questions`` so nobody has to guess which of these the team has
    already argued about. These are new, and they want a decision from a human.
    """
    stats = result.by_id()
    total = result.total
    out: list[Question] = []

    # -------------------------------------------------- unevaluable vs not-applicable
    # A rule that is unevaluable on a large share of the corpus is usually not suffering from
    # flaky data — its input does not exist for that kind of subject at all.
    structurally_absent = sorted(
        (
            s
            for s in result.rules
            if total > 0 and s.status != STATUS_DISABLED and s.unevaluable / total >= 0.10
        ),
        key=lambda s: -s.unevaluable,
    )
    if structurally_absent:
        ids = ", ".join(f"{s.rule_id} ({s.unevaluable / total:.0%})" for s in structurally_absent)
        out.append(
            Question(
                id="unevaluable-vs-not-applicable",
                title="The model cannot distinguish 'not applicable to this subject' from 'unknown today'",
                source="backtest observation (new)",
                detail=(
                    "read_signal returns None for a signal that is absent, and evaluate.py maps None "
                    "to UNKNOWN. So a subject who has no menstrual cycle at all makes rules 2.1–2.4 "
                    "UNEVALUABLE every single day, exactly as if their cycle data were merely missing. "
                    "Same for Layer 5 when no labs are attached."
                ),
                evidence=[
                    f"Rules unevaluable on 10%+ of this corpus: {ids}.",
                    "This is not cosmetic: it decides the denominator of every fire rate. Over a mixed "
                    "cohort, L2 'fire rate' silently means 'rate among cycle-tracking subjects' while "
                    "L1 means 'rate among everyone'. The harness reports both denominators rather than "
                    "choosing, but the underlying modelling gap needs a decision.",
                    "Product question: should the contract carry an explicit not-applicable state "
                    "(e.g. cycle.tracked=false meaning N/A rather than unknown)?",
                ],
            )
        )

    # -------------------------------------------------- `any` rules and partial input
    multi_signal_any = []
    for rule in book.rules:
        conditions = rule.when.get("any") or []
        signals = {c["signal"] for c in conditions}
        if len(signals) > 1:
            stat = stats.get(rule.id)
            if stat is not None and stat.status != STATUS_DISABLED:
                multi_signal_any.append((rule.id, sorted(signals), stat))
    if multi_signal_any:
        out.append(
            Question(
                id="any-rules-cannot-resolve-false-on-partial-input",
                title="An `any` rule stays UNKNOWN unless every signal it references is present",
                source="backtest observation (new) — veyos_engine/evaluate.py:rule_fires",
                detail=(
                    "For `any`, rule_fires returns TRUE on the first true condition, but otherwise "
                    "degrades to UNKNOWN if ANY condition was UNKNOWN. So a rule reading two signals "
                    "can only resolve FALSE when both are present. Rule 5.3 reads hba1c OR "
                    "fasting_glucose: a subject with an HbA1c and no fasting glucose can never get a "
                    "'no' from 5.3 — only 'yes' or 'we cannot say'. Partial lab panels are the norm, "
                    "not the exception."
                ),
                evidence=[
                    "Multi-signal `any` rules in this rulebook: "
                    + "; ".join(f"{rid} ({', '.join(sig)})" for rid, sig, _ in multi_signal_any)
                    + ".",
                    *[
                        f"{rid}: unevaluable on {_pct(stat.unevaluable, total)}, "
                        f"resolved FALSE on {_pct(stat.not_fired, total)}."
                        for rid, _, stat in multi_signal_any
                    ],
                    "Whether that is correct is a product decision. It is defensible (absent != normal) "
                    "but it means the evaluable fire rate for such a rule is biased upward: the only "
                    "snapshots that resolve at all are disproportionately the ones that fire.",
                ],
            )
        )

    # -------------------------------------------------- docs vs engine on UNKNOWN warnings
    silent = result.invariants.unevaluable_without_warning
    if silent:
        out.append(
            Question(
                id="unknown-condition-emits-no-warning",
                title=(
                    "docs/engine.md promises a warning on UNKNOWN conditions; the engine only "
                    "warns on a missing baseline"
                ),
                source="backtest observation (new) — docs/engine.md vs veyos_engine/evaluate.py",
                detail=(
                    "docs/engine.md: 'Rules containing an UNKNOWN condition do not fire, and the "
                    "decision carries a warning so the client can say \"still learning your baseline\"'. "
                    "In evaluate.py a warning is appended only when a BASELINE is missing. A missing "
                    "SIGNAL yields an unevaluable trace row and no warning at all. Fixture F14 pins the "
                    "trace, not a warning, so the suite agrees with the code and the doc is the outlier."
                ),
                evidence=[
                    f"{_pct(silent, total)} of snapshots had at least one unevaluable rule and an "
                    f"EMPTY warnings list.",
                    "A client following docs/engine.md would show 'you're in balance today' on those "
                    "snapshots, which is the failure mode the three-valued logic exists to prevent.",
                    "Needs a decision: fix the doc, or emit the warning. Do not assume the doc is wrong.",
                ],
            )
        )

    # -------------------------------------------------- layer invariants
    for layer, count in sorted(result.invariants.multi_fire.items()):
        if layer == 2:
            out.append(
                Question(
                    id="layer-2-not-mutually-exclusive",
                    title="More than one Layer 2 rule fired on the same snapshot",
                    source="backtest observation (new) — rulebook layer 2: 'Exactly one fires'",
                    detail="Cycle-day ranges are supposed to be mutually exclusive.",
                    evidence=[f"{_pct(count, total)} of snapshots fired multiple L2 rules."],
                )
            )
        elif layer == 3:
            out.append(
                Question(
                    id="layer-3-not-mutually-exclusive",
                    title="More than one Layer 3 dosha rule fired on the same snapshot",
                    source="backtest observation (new)",
                    detail="A subject has exactly one dosha; 3.1/3.2/3.3 should be disjoint.",
                    evidence=[f"{_pct(count, total)} of snapshots fired multiple L3 rules."],
                )
            )

    if result.invariants.l3_silent and result.elemental_layer_enabled:
        out.append(
            Question(
                id="layer-3-silent",
                title="Layer 3 is declared always_on but fired nothing on some snapshots",
                source="backtest observation (new)",
                detail=(
                    "engine.py computes state via all(rule.layer in always_on for ...), which is "
                    "vacuously True when NOTHING fired — so a snapshot with zero fired rules reports "
                    "state=calm."
                ),
                evidence=[f"{_pct(result.invariants.l3_silent, total)} of snapshots fired no L3 rule."],
            )
        )

    return out
