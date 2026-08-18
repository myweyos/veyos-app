"""Synthetic snapshot generator.

A **deterministic cartesian sweep**, not a sampler. Same axes in, byte-identical corpus
out, in a fixed order — no clock, no RNG, nothing that would make two runs of the same
backtest disagree. That is the same discipline the engine itself is held to, and it is what
lets you diff two backtests and attribute the difference to the rulebook rather than to
luck.

Axis values hug the rulebook's thresholds on purpose. For every numeric threshold the
sweep includes a point that lands exactly on it and a point one step the other side, so the
corpus proves which way an inclusive ``gte`` actually resolves instead of assuming.

WHAT THIS CORPUS IS NOT
-----------------------
It is a uniform grid over parameter space. Real subjects are not uniformly distributed over
parameter space — they sit near their own baseline most days. A fire rate measured here is
therefore **coverage of the input space, not incidence in a population**, and must never be
quoted as "rule X fires on Y% of days". See ``README.md``.
"""

from __future__ import annotations

import itertools
from collections.abc import Iterator
from dataclasses import dataclass, replace
from typing import Any

# No rule reads ``as_of``; it is fixed so the corpus stays byte-reproducible. The sweep is a
# cross-section over parameter space, not a time series, and dating it otherwise would imply
# a longitudinal structure the harness does not have.
SYNTHETIC_AS_OF = "2026-01-01"

# Fixed baselines. The percent axes are expressed against these, which is what makes a
# threshold land exactly on the boundary rather than near it.
BASELINES: dict[str, Any] = {
    "hrv_ms": 60.0,
    "hrv_sd": 6.0,
    "rhr_bpm": 60.0,
    "rhr_sd": 3.0,
    "sleep_deep_rem_pct": 70.0,
    # Comfortably above rules.v1.yaml's min_days_for_baseline (28) so the corpus does not
    # collapse into insufficient_baseline. Cold start is a separate concern — see questions.py.
    "days_of_history": 90,
    "window_days": 14,
}

# Named environment bundles rather than one axis per environmental signal: this keeps L4
# reachable (4.1 needs a full moon, 4.2 needs >25 C, 4.3 needs autumn or >=30 kph) without
# multiplying the grid by three.
ENV_PROFILES: dict[str, dict[str, Any]] = {
    "mild": {"ambient_temp_c": 18.0, "moon_phase": "waxing", "season": "summer", "wind_kph": 8.0},
    "heatwave": {"ambient_temp_c": 30.0, "moon_phase": "waxing", "season": "summer", "wind_kph": 8.0},
    "full_moon": {"ambient_temp_c": 18.0, "moon_phase": "full", "season": "summer", "wind_kph": 8.0},
    "autumn_wind": {"ambient_temp_c": 14.0, "moon_phase": "waxing", "season": "autumn", "wind_kph": 35.0},
    # Not in any stock grid. Exists so the one-hot-ness of the others can be shown to be a
    # property of the generator rather than of the rulebook: L4 rules CAN co-fire.
    "heatwave_full_moon": {
        "ambient_temp_c": 30.0,
        "moon_phase": "full",
        "season": "summer",
        "wind_kph": 8.0,
    },
}

# Layer 5 fires only on present-AND-abnormal. "none" supplies no labs at all, which is the
# common production case and which makes every L5 rule UNEVALUABLE rather than false.
LAB_PROFILES: dict[str, dict[str, Any]] = {
    "none": {},
    # Every lab the rulebook reads, present and normal. fasting_glucose has to be in here:
    # rule 5.3 is an `any` over hba1c OR fasting_glucose, and an `any` rule cannot resolve
    # FALSE while any of its conditions is UNKNOWN. Omit one and 5.3 is never falsifiable.
    "all_normal": {
        "pm_cortisol": {"status": "normal"},
        "hs_crp": {"status": "normal"},
        "hba1c": {"status": "normal"},
        "fasting_glucose": {"status": "normal"},
    },
    "cortisol_high": {"pm_cortisol": {"status": "high"}},
    "crp_high": {"hs_crp": {"status": "high"}},
    "hba1c_high": {"hba1c": {"status": "high"}},
}

# Held constant so that food arbitration is exercised without becoming another axis. The
# tags are drawn from the controlled vocabulary and are chosen to collide with L3 dosha
# blocks, the L5 blood-sugar block and the L1 immunity additions.
PLANNED_ACTIVITY: dict[str, Any] = {"type": "hiit", "intensity": "high", "location": "outdoor_midday"}

PLANNED_MEALS: list[dict[str, Any]] = [
    {
        "slot": "breakfast",
        "items": [
            {"name": "overnight oats", "tags": ["cold", "complex_carbs"]},
            {"name": "black coffee", "tags": ["caffeine"]},
        ],
    },
    {
        "slot": "lunch",
        "items": [
            {"name": "kimchi rice bowl", "tags": ["fermented", "spicy", "complex_carbs"]},
            {"name": "cucumber salad", "tags": ["cooling", "hydrating", "raw"]},
        ],
    },
    {
        "slot": "dinner",
        "items": [
            {"name": "sweet potato mash", "tags": ["warm", "heavy", "complex_carbs"]},
            {"name": "grilled chicken", "tags": ["high_protein", "warm"]},
        ],
    },
]


@dataclass(frozen=True)
class Axes:
    """One sweep. Every field is an explicit list of points — no ranges, no step sizes.

    Percent axes are *percent of the subject's own baseline*, which is the form the rulebook
    is written in. 80 means "at 80% of baseline", i.e. exactly 20% below it.
    """

    dosha: tuple[str, ...]
    hrv_pct_of_baseline: tuple[float, ...]
    rhr_pct_of_baseline: tuple[float, ...]
    sleep_pct_of_baseline: tuple[float | None, ...]
    wrist_temp_delta_c: tuple[float, ...]
    cycle_day: tuple[int | None, ...]
    env_profile: tuple[str, ...]
    lab_profile: tuple[str, ...]

    def size(self) -> int:
        return (
            len(self.dosha)
            * len(self.hrv_pct_of_baseline)
            * len(self.rhr_pct_of_baseline)
            * len(self.sleep_pct_of_baseline)
            * len(self.wrist_temp_delta_c)
            * len(self.cycle_day)
            * len(self.env_profile)
            * len(self.lab_profile)
        )

    def describe(self) -> dict[str, Any]:
        return {
            "dosha": list(self.dosha),
            "hrv_pct_of_baseline": list(self.hrv_pct_of_baseline),
            "rhr_pct_of_baseline": list(self.rhr_pct_of_baseline),
            "sleep_pct_of_baseline": list(self.sleep_pct_of_baseline),
            "wrist_temp_delta_c": list(self.wrist_temp_delta_c),
            "cycle_day": list(self.cycle_day),
            "env_profile": list(self.env_profile),
            "lab_profile": list(self.lab_profile),
            "size": self.size(),
        }


DOSHAS: tuple[str, ...] = ("vata", "pitta", "kapha")

# Threshold map, for reference when reading the axis values below:
#   1.1  hrv  pct_below_baseline_gte 20   -> fires at hrv_pct <= 80
#   1.2  sleep pct_of_baseline_lt   60    -> fires at sleep_pct < 60
#   1.3  temp gte 0.5 AND rhr pct_above_baseline_gte 5 -> fires at temp >= 0.5 and rhr_pct >= 105
#   1.4  rhr  pct_above_baseline_gte 15   -> would fire at rhr_pct >= 115 (DISABLED)
#   4.2  ambient_temp_c gt 25             -> heatwave profile
GRIDS: dict[str, Axes] = {
    # Small enough for CI. Still straddles every enabled threshold and keeps every enabled
    # rule reachable — a preset that leaves a rule permanently unfired teaches nothing.
    "quick": Axes(
        dosha=DOSHAS,
        hrv_pct_of_baseline=(80.0, 100.0),
        rhr_pct_of_baseline=(100.0, 105.0),
        sleep_pct_of_baseline=(55.0, 95.0),
        wrist_temp_delta_c=(0.0, 0.5),
        cycle_day=(None, 3, 10, 14, 20),
        env_profile=("mild", "heatwave", "full_moon", "autumn_wind"),
        lab_profile=("none", "all_normal", "hba1c_high"),
    ),
    # Default. Every numeric threshold gets an exactly-on-it point and a just-past-it point.
    # Cycle days cover one representative day per Layer 2 phase plus the day-28 edge.
    "boundary": Axes(
        dosha=DOSHAS,
        hrv_pct_of_baseline=(70.0, 80.0, 81.0, 100.0),
        rhr_pct_of_baseline=(100.0, 105.0, 115.0, 125.0),
        sleep_pct_of_baseline=(55.0, 59.0, 60.0, 95.0),
        wrist_temp_delta_c=(0.0, 0.5, 0.9),
        cycle_day=(None, 3, 10, 14, 20, 28),
        env_profile=("mild", "heatwave", "full_moon", "autumn_wind"),
        # all_normal matters: without a present-and-normal lab, the L5 evaluable fire rate is
        # trivially 100% and says nothing.
        lab_profile=("none", "all_normal", "cortisol_high", "crp_high", "hba1c_high"),
    ),
    # Adds interior points and a null sleep reading (the Alex case: composite score present,
    # deep/REM stage percentage absent, so rule 1.2 is unevaluable rather than false).
    "fine": Axes(
        dosha=DOSHAS,
        hrv_pct_of_baseline=(70.0, 79.0, 80.0, 81.0, 90.0, 105.0),
        rhr_pct_of_baseline=(98.0, 104.0, 105.0, 115.0, 116.0, 130.0),
        sleep_pct_of_baseline=(None, 45.0, 59.0, 60.0, 75.0, 100.0),
        wrist_temp_delta_c=(-0.2, 0.0, 0.5, 1.0),
        cycle_day=(None, 1, 5, 6, 14, 28),
        env_profile=("mild", "heatwave", "full_moon", "autumn_wind"),
        lab_profile=("none", "all_normal", "cortisol_high", "crp_high", "hba1c_high"),
    ),
}

DEFAULT_GRID = "boundary"


def _parse_float(raw: str) -> float:
    return float(raw)


def _parse_optional_float(raw: str) -> float | None:
    return None if raw.lower() in {"none", "null"} else float(raw)


def _parse_optional_int(raw: str) -> int | None:
    return None if raw.lower() in {"none", "null"} else int(raw)


def _parse_dosha(raw: str) -> str:
    if raw not in DOSHAS:
        raise ValueError(f"unknown dosha '{raw}' (expected one of {', '.join(DOSHAS)})")
    return raw


def _parse_env(raw: str) -> str:
    if raw not in ENV_PROFILES:
        raise ValueError(f"unknown env_profile '{raw}' (expected one of {', '.join(sorted(ENV_PROFILES))})")
    return raw


def _parse_lab(raw: str) -> str:
    if raw not in LAB_PROFILES:
        raise ValueError(f"unknown lab_profile '{raw}' (expected one of {', '.join(sorted(LAB_PROFILES))})")
    return raw


# Axis name -> value parser. Also the authoritative list of what --axis accepts.
AXIS_PARSERS: dict[str, Any] = {
    "dosha": _parse_dosha,
    "hrv_pct_of_baseline": _parse_float,
    "rhr_pct_of_baseline": _parse_float,
    "sleep_pct_of_baseline": _parse_optional_float,
    "wrist_temp_delta_c": _parse_float,
    "cycle_day": _parse_optional_int,
    "env_profile": _parse_env,
    "lab_profile": _parse_lab,
}


def apply_overrides(axes: Axes, overrides: list[str]) -> Axes:
    """Apply ``name=v1,v2,...`` axis overrides to a preset.

    This is how you sweep a region the stock grids deliberately avoid — cycle days past 28,
    a null sleep reading, an environment where two Layer 4 rules can both apply. It changes
    the corpus, never the rulebook.
    """
    replacements: dict[str, tuple[Any, ...]] = {}
    for override in overrides:
        if "=" not in override:
            raise ValueError(f"--axis expects NAME=v1,v2,... (got '{override}')")
        name, _, values = override.partition("=")
        name = name.strip()
        if name not in AXIS_PARSERS:
            raise ValueError(f"unknown axis '{name}' (expected one of {', '.join(sorted(AXIS_PARSERS))})")
        parser = AXIS_PARSERS[name]
        parts = [part.strip() for part in values.split(",") if part.strip()]
        if not parts:
            raise ValueError(f"axis '{name}' was given no values")
        replacements[name] = tuple(parser(part) for part in parts)
    return replace(axes, **replacements) if replacements else axes


def _from_baseline(baseline: float, pct: float | None) -> float | None:
    """Percent-of-baseline -> absolute reading, rounded so thresholds land cleanly."""
    if pct is None:
        return None
    return round(baseline * pct / 100.0, 3)


def build_snapshot(
    index: int,
    *,
    dosha: str,
    hrv_pct: float,
    rhr_pct: float,
    sleep_pct: float | None,
    wrist_temp_delta_c: float,
    cycle_day: int | None,
    env_profile: str,
    lab_profile: str,
    as_of: str = SYNTHETIC_AS_OF,
) -> dict[str, Any]:
    """One SignalSnapshot in canonical form.

    Emits only fields the published JSON Schema allows — it sets
    ``additionalProperties: false`` at every level, and ``tests/test_backtest.py`` validates
    generated snapshots against it so this generator cannot drift from the contract.
    """
    # cycle_day None models a subject with no cycle tracking at all, which is how the
    # personas fixture represents it. Note what this does to Layer 2 — see questions.py.
    cycle: dict[str, Any] | None = (
        None if cycle_day is None else {"cycle_day": cycle_day, "cycle_length": 28, "tracked": True}
    )

    return {
        "schema_version": 1,
        "subject_ref": f"sub_syn{index:06d}",
        "as_of": as_of,
        "timezone": "Europe/London",
        "constitution": {"dosha": dosha},
        "biometrics": {
            "hrv_ms": _from_baseline(BASELINES["hrv_ms"], hrv_pct),
            "rhr_bpm": _from_baseline(BASELINES["rhr_bpm"], rhr_pct),
            "sleep_deep_rem_pct": _from_baseline(BASELINES["sleep_deep_rem_pct"], sleep_pct),
            "wrist_temp_delta_c": wrist_temp_delta_c,
            "steps": 8000,
            "source": "simulated",
        },
        "baselines": dict(BASELINES),
        "cycle": cycle,
        "environment": dict(ENV_PROFILES[env_profile]),
        "labs": {k: dict(v) for k, v in LAB_PROFILES[lab_profile].items()},
        "planned_activity": dict(PLANNED_ACTIVITY),
        "planned_meals": [
            {"slot": meal["slot"], "items": [dict(i) for i in meal["items"]]} for meal in PLANNED_MEALS
        ],
    }


def generate(
    axes: Axes,
    *,
    as_of: str = SYNTHETIC_AS_OF,
    limit: int | None = None,
) -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield ``(id, snapshot)`` for the full cartesian product, in a fixed axis order.

    The order is part of the contract: it is what makes ``--limit`` a stable prefix of the
    corpus rather than an arbitrary subset.
    """
    product = itertools.product(
        axes.dosha,
        axes.hrv_pct_of_baseline,
        axes.rhr_pct_of_baseline,
        axes.sleep_pct_of_baseline,
        axes.wrist_temp_delta_c,
        axes.cycle_day,
        axes.env_profile,
        axes.lab_profile,
    )
    for index, (dosha, hrv, rhr, sleep, temp, cycle_day, env, lab) in enumerate(product):
        if limit is not None and index >= limit:
            return
        snapshot = build_snapshot(
            index,
            dosha=dosha,
            hrv_pct=hrv,
            rhr_pct=rhr,
            sleep_pct=sleep,
            wrist_temp_delta_c=temp,
            cycle_day=cycle_day,
            env_profile=env,
            lab_profile=lab,
            as_of=as_of,
        )
        yield f"syn{index:06d}", snapshot
