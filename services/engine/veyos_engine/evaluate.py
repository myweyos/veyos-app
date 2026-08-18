"""Condition evaluation.

Three-valued logic on purpose. A condition is TRUE, FALSE, or UNKNOWN — and UNKNOWN is
not FALSE. Missing HRV means "we cannot say whether the subject is in sympathetic
overload", which is a different product state from "they are not". Rules containing an
UNKNOWN condition do not fire, and the engine emits a warning so the client can show
"we're still learning your baseline" instead of "you're in balance today".
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from .config import Rule, Rulebook
from .models import Snapshot

TRUE, FALSE, UNKNOWN = True, False, None
Tri = bool | None

# signal name -> (snapshot section, field, baseline field or None, sd field or None)
SIGNAL_MAP: dict[str, tuple[str, str, str | None, str | None]] = {
    "hrv_ms": ("biometrics", "hrv_ms", "hrv_ms", "hrv_sd"),
    "rhr_bpm": ("biometrics", "rhr_bpm", "rhr_bpm", "rhr_sd"),
    "sleep_deep_rem_pct": ("biometrics", "sleep_deep_rem_pct", "sleep_deep_rem_pct", None),
    "wrist_temp_delta_c": ("biometrics", "wrist_temp_delta_c", None, None),
    "steps": ("biometrics", "steps", None, None),
    "cycle_day": ("cycle", "cycle_day", None, None),
    "ambient_temp_c": ("environment", "ambient_temp_c", None, None),
    "moon_phase": ("environment", "moon_phase", None, None),
    "season": ("environment", "season", None, None),
    "wind_kph": ("environment", "wind_kph", None, None),
    "pollen_index": ("environment", "pollen_index", None, None),
    "aqi": ("environment", "aqi", None, None),
}


@dataclass
class Reading:
    value: Any = None
    baseline: float | None = None
    sd: float | None = None


def read_signal(snapshot: Snapshot, signal: str) -> Reading:
    if signal == "dosha":
        return Reading(value=snapshot.dosha)
    if signal.startswith("lab_"):
        lab = snapshot.labs.get(signal[4:])
        return Reading(value=lab.status if lab else None)
    if signal not in SIGNAL_MAP:
        raise KeyError(
            f"unknown signal '{signal}' — add it to SIGNAL_MAP and the JSON Schema together"
        )

    section, key, base_key, sd_key = SIGNAL_MAP[signal]
    data = getattr(snapshot, section) or {}
    baselines = snapshot.baselines or {}
    return Reading(
        value=data.get(key),
        baseline=baselines.get(base_key) if base_key else None,
        sd=baselines.get(sd_key) if sd_key else None,
    )


def evaluate_condition(
    condition: dict[str, Any],
    snapshot: Snapshot,
    book: Rulebook,
    warnings: list[str],
) -> tuple[Tri, str]:
    """Return (verdict, human-readable explanation).

    The explanation carries deltas and thresholds only — never a raw biometric value
    bound to a subject. It ends up in the decision trace, which is retained.
    """
    signal = condition["signal"]
    op = condition["op"]
    expected = condition.get("value")
    reading = read_signal(snapshot, signal)
    current = reading.value

    if current is None:
        return UNKNOWN, f"{signal} not available"

    if op in {"pct_below_baseline_gte", "pct_above_baseline_gte", "pct_of_baseline_lt"}:
        if reading.baseline in (None, 0):
            warnings.append(f"{signal}: no baseline available, dependent rules were skipped")
            return UNKNOWN, f"{signal} has no baseline"
        return _baseline_op(op, signal, condition, reading, book, warnings)

    if op == "in_range":
        low, high = condition["value"]
        inside = bool(low <= current <= high)
        where = "within" if inside else "outside"
        return inside, f"{signal} {where} [{low}, {high}]"

    comparators: dict[str, tuple[Callable[[Any, Any], bool], str]] = {
        "gte": (lambda a, b: a >= b, ">="),
        "gt": (lambda a, b: a > b, ">"),
        "lte": (lambda a, b: a <= b, "<="),
        "lt": (lambda a, b: a < b, "<"),
    }
    if op in comparators:
        fn, symbol = comparators[op]
        result = fn(current, expected)
        return result, f"{signal} {symbol} {expected} is {result}"

    if op in {"eq", "lab_status_eq"}:
        return current == expected, f"{signal} == {expected} is {current == expected}"

    raise KeyError(f"unknown operator '{op}'")


def _baseline_op(
    op: str,
    signal: str,
    condition: dict[str, Any],
    reading: Reading,
    book: Rulebook,
    warnings: list[str],
) -> tuple[Tri, str]:
    current = float(reading.value)
    baseline = float(reading.baseline)  # type: ignore[arg-type]
    threshold = float(condition["value"])

    # Both comparison forms are implemented because the rulebook and the patent disagree
    # (percent-below-baseline vs (current - trailing MA) / historical SD). The choice is a
    # backtest decision, not a code decision — see config/rules/rules.v1.yaml.
    if book.comparison_mode == "zscore":
        z_threshold = condition.get("value_z")
        if z_threshold is None or reading.sd in (None, 0):
            warnings.append(
                f"{signal}: zscore comparison requested but no value_z/SD available on this "
                f"condition — fell back to percent. Resolve before trusting a backtest."
            )
        else:
            z = (current - baseline) / float(reading.sd)
            if op == "pct_below_baseline_gte":
                return -z >= float(z_threshold), f"{signal} z={z:.2f} vs -{z_threshold}"
            if op == "pct_above_baseline_gte":
                return z >= float(z_threshold), f"{signal} z={z:.2f} vs +{z_threshold}"
            return z <= -float(z_threshold), f"{signal} z={z:.2f}"

    if op == "pct_below_baseline_gte":
        delta = (baseline - current) / baseline * 100
        return delta >= threshold, f"{signal} {delta:.1f}% below baseline (threshold {threshold}%)"
    if op == "pct_above_baseline_gte":
        delta = (current - baseline) / baseline * 100
        return delta >= threshold, f"{signal} {delta:.1f}% above baseline (threshold {threshold}%)"

    pct = current / baseline * 100
    return pct < threshold, f"{signal} at {pct:.1f}% of baseline (threshold {threshold}%)"


def rule_fires(
    rule: Rule,
    snapshot: Snapshot,
    book: Rulebook,
    warnings: list[str],
) -> tuple[Tri, list[str]]:
    reasons: list[str] = []

    if rule.when.get("all"):
        verdict: Tri = TRUE
        for condition in rule.when["all"]:
            result, why = evaluate_condition(condition, snapshot, book, warnings)
            reasons.append(why)
            if result is FALSE:
                return FALSE, reasons
            if result is UNKNOWN:
                verdict = UNKNOWN
        return verdict, reasons

    verdict = FALSE
    for condition in rule.when.get("any", []):
        result, why = evaluate_condition(condition, snapshot, book, warnings)
        reasons.append(why)
        if result is TRUE:
            return TRUE, reasons
        if result is UNKNOWN:
            verdict = UNKNOWN if verdict is FALSE else verdict
    return verdict, reasons
