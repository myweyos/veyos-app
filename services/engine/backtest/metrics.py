"""Aggregation: fire counts, fire rates, co-firing.

Two denominators, both reported, neither chosen for you
-------------------------------------------------------
A rule can come out TRUE, FALSE or UNKNOWN, so "fire rate" has more than one honest
definition:

* ``fire_rate``           = fired / **all** snapshots
* ``evaluable_fire_rate`` = fired / snapshots where the rule actually resolved TRUE-or-FALSE

They diverge hard for rules whose inputs are structurally absent — Layer 5 with no labs
attached, Layer 2 for a subject with no cycle tracking. Quoting one without the other
either understates a rule (it never had the data) or overstates it (it only ever saw the
subset of subjects who had the data). The harness reports both and refuses to pick; see
``questions.py``.

For a rule that was never evaluated at all — disabled, or suppressed for the whole run —
both rates are ``None`` rather than ``0.0``. A disabled rule has not been shown to never
fire; it has not been asked.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from veyos_engine.config import Rulebook

from .runner import LoadError, SnapshotOutcome

STATUS_EVALUATED = "evaluated"
STATUS_DISABLED = "disabled"
STATUS_SUPPRESSED = "suppressed"

# Engine warnings are free text with values interpolated into them. The harness counts them
# by category and never reprints the raw string — a warning like "cold start: 10 days of
# history" or "cycle_day 31 is outside the 28-day model" carries subject data.
WARNING_CATEGORIES: tuple[tuple[str, str], ...] = (
    ("cold_start", "cold start"),
    ("cycle_day_undefined", "UNDEFINED in rulebook"),
    ("no_baseline", "no baseline available"),
    ("zscore_fallback", "zscore comparison requested"),
    ("l1_addition_collision", "per-item substitution is unresolved"),
    ("multiple_l2_fired", "more than one Layer 2 rule fired"),
)


def categorise_warning(warning: str) -> str:
    for label, needle in WARNING_CATEGORIES:
        if needle in warning:
            return label
    return "uncategorised"


@dataclass
class RuleStats:
    rule_id: str
    name: str
    layer: int
    priority: int
    status: str
    fired: int = 0
    unevaluable: int = 0
    suppressed: int = 0
    total: int = 0

    @property
    def evaluated(self) -> int:
        """Snapshots where the rule resolved to a definite TRUE or FALSE."""
        return self.total - self.unevaluable - self.suppressed

    @property
    def not_fired(self) -> int:
        return self.evaluated - self.fired

    @property
    def fire_rate(self) -> float | None:
        if self.status != STATUS_EVALUATED or self.total == 0:
            return None
        return self.fired / self.total

    @property
    def evaluable_fire_rate(self) -> float | None:
        if self.status != STATUS_EVALUATED or self.evaluated <= 0:
            return None
        return self.fired / self.evaluated

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "name": self.name,
            "layer": self.layer,
            "priority": self.priority,
            "status": self.status,
            "fired": self.fired,
            "not_fired": self.not_fired,
            "unevaluable": self.unevaluable,
            "suppressed": self.suppressed,
            "evaluated": self.evaluated,
            "total": self.total,
            "fire_rate": self.fire_rate,
            "evaluable_fire_rate": self.evaluable_fire_rate,
        }


@dataclass
class CoFiring:
    """Unordered pair counts, plus the asymmetric conditional view.

    ``count`` answers "how often did these two fire together". ``conditional(a, b)`` answers
    "given a fired, how often did b fire too" — which is the question you actually have when
    you are looking for a rule that is subsumed by another.
    """

    pairs: dict[tuple[str, str], int] = field(default_factory=dict)
    fired: dict[str, int] = field(default_factory=dict)
    total: int = 0

    @staticmethod
    def _key(a: str, b: str) -> tuple[str, str]:
        return (a, b) if a <= b else (b, a)

    def count(self, a: str, b: str) -> int:
        return self.pairs.get(self._key(a, b), 0)

    def rate(self, a: str, b: str) -> float | None:
        """Share of *all* snapshots on which both fired."""
        if self.total == 0:
            return None
        return self.count(a, b) / self.total

    def conditional(self, a: str, b: str) -> float | None:
        """P(b fired | a fired). None when a never fired, because it is undefined, not zero."""
        denominator = self.fired.get(a, 0)
        if denominator == 0:
            return None
        return self.count(a, b) / denominator

    def jaccard(self, a: str, b: str) -> float | None:
        union = self.fired.get(a, 0) + self.fired.get(b, 0) - self.count(a, b)
        if union <= 0:
            return None
        return self.count(a, b) / union


@dataclass
class LayerInvariants:
    """Empirical checks on claims the rulebook makes about itself."""

    multi_fire: dict[int, int] = field(default_factory=dict)
    l3_silent: int = 0
    # docs/engine.md: "Rules containing an UNKNOWN condition do not fire, and the decision
    # carries a warning". Counting the snapshots where that did NOT hold is how the harness
    # checks the doc against the engine rather than trusting it.
    unevaluable_without_warning: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "layers_with_multiple_rules_fired": {str(k): v for k, v in sorted(self.multi_fire.items())},
            "snapshots_with_no_layer_3_rule": self.l3_silent,
            "snapshots_unevaluable_but_no_warning": self.unevaluable_without_warning,
        }


@dataclass
class RunResult:
    total: int
    rulebook_version: int
    comparison_mode: str
    elemental_layer_enabled: bool
    corpus_label: str
    rules: list[RuleStats]
    cofiring: CoFiring
    states: Counter[str]
    activity_verdicts: Counter[str]
    activity_decided_by: Counter[str]
    warnings: Counter[str]
    invariants: LayerInvariants
    errors: list[LoadError]
    meta: dict[str, Any] = field(default_factory=dict)

    def by_id(self) -> dict[str, RuleStats]:
        return {rule.rule_id: rule for rule in self.rules}

    def to_dict(self) -> dict[str, Any]:
        """JSON form.

        Carries no wall-clock and no host detail, so two runs of the same corpus against the
        same rulebook produce byte-identical output and can be diffed across a rule change.
        """
        ids = [rule.rule_id for rule in self.rules]
        return {
            "corpus": self.corpus_label,
            "total_snapshots": self.total,
            "rulebook_version": self.rulebook_version,
            "comparison_mode": self.comparison_mode,
            "elemental_layer_enabled": self.elemental_layer_enabled,
            "meta": self.meta,
            "rules": [rule.to_dict() for rule in self.rules],
            "cofiring": {
                a: {
                    b: {
                        "count": self.cofiring.count(a, b),
                        "rate_of_all": self.cofiring.rate(a, b),
                        "p_b_given_a": self.cofiring.conditional(a, b),
                        "jaccard": self.cofiring.jaccard(a, b),
                    }
                    for b in ids
                    if b != a
                }
                for a in ids
            },
            "states": dict(sorted(self.states.items())),
            "activity_verdicts": dict(sorted(self.activity_verdicts.items())),
            "activity_decided_by": dict(sorted(self.activity_decided_by.items())),
            "warning_categories": dict(sorted(self.warnings.items())),
            "invariants": self.invariants.to_dict(),
            "errors": [
                {"path": e.path, "kind": e.kind, "detail": e.detail} for e in self.errors
            ],
        }


def rule_status(book: Rulebook, layer: int, enabled: bool, elemental_enabled: bool) -> str:
    if not enabled:
        return STATUS_DISABLED
    if not elemental_enabled and layer not in book.validated_only_layers:
        return STATUS_SUPPRESSED
    return STATUS_EVALUATED


def aggregate(
    book: Rulebook,
    outcomes: Iterable[SnapshotOutcome],
    *,
    elemental_enabled: bool,
    corpus_label: str = "corpus",
    errors: list[LoadError] | None = None,
    meta: dict[str, Any] | None = None,
) -> RunResult:
    """Fold a stream of outcomes into the report model."""
    stats = {
        rule.id: RuleStats(
            rule_id=rule.id,
            name=rule.name,
            layer=rule.layer,
            priority=rule.priority,
            status=rule_status(book, rule.layer, rule.enabled, elemental_enabled),
        )
        for rule in sorted(book.rules, key=lambda r: r.priority)
    }
    layer_of = {rule.id: rule.layer for rule in book.rules}

    cofiring = CoFiring()
    states: Counter[str] = Counter()
    verdicts: Counter[str] = Counter()
    decided_by: Counter[str] = Counter()
    warning_counts: Counter[str] = Counter()
    invariants = LayerInvariants()

    total = 0
    for outcome in outcomes:
        total += 1
        states[outcome.state] += 1
        verdicts[outcome.activity_verdict] += 1
        decided_by[outcome.activity_decided_by or "(none)"] += 1
        for warning in outcome.warnings:
            warning_counts[categorise_warning(warning)] += 1

        for rule_id, stat in stats.items():
            stat.total += 1
            if rule_id in outcome.fired:
                stat.fired += 1
            elif rule_id in outcome.unevaluable:
                stat.unevaluable += 1
            elif rule_id in outcome.suppressed:
                stat.suppressed += 1

        fired = sorted(outcome.fired)
        for rule_id in fired:
            cofiring.fired[rule_id] = cofiring.fired.get(rule_id, 0) + 1
        for i, a in enumerate(fired):
            for b in fired[i + 1 :]:
                key = CoFiring._key(a, b)
                cofiring.pairs[key] = cofiring.pairs.get(key, 0) + 1

        per_layer: Counter[int] = Counter(layer_of[r] for r in outcome.fired if r in layer_of)
        for layer, count in per_layer.items():
            if count > 1:
                invariants.multi_fire[layer] = invariants.multi_fire.get(layer, 0) + 1
        if per_layer.get(3, 0) == 0:
            invariants.l3_silent += 1
        if outcome.unevaluable and not outcome.warnings:
            invariants.unevaluable_without_warning += 1

    cofiring.total = total

    return RunResult(
        total=total,
        rulebook_version=book.version,
        comparison_mode=book.comparison_mode,
        elemental_layer_enabled=elemental_enabled,
        corpus_label=corpus_label,
        rules=list(stats.values()),
        cofiring=cofiring,
        states=states,
        activity_verdicts=verdicts,
        activity_decided_by=decided_by,
        warnings=warning_counts,
        invariants=invariants,
        errors=list(errors or []),
        meta=dict(meta or {}),
    )
