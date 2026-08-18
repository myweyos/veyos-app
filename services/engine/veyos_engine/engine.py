"""Arbitration.

Pure function: (Snapshot, Rulebook) -> Decision dict. No I/O, no clock, no randomness.
That is what makes the 16 rules testable without a phone, a wearable or a backend, and
what makes the output defensible in a regulatory conversation: every field in the
decision is traceable to a rule id and a threshold crossing.

Precedence: Layer 1 > Layer 5 > Layer 2 > Layer 3 > Layer 4.
Food is a build-then-filter chain applied in the reverse order (least authoritative
first) so that the most authoritative layer gets the last word.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .config import Rule, Rulebook, load_rulebook
from .evaluate import rule_fires
from .models import VERDICT_RANK, FiredRule, FoodItem, Snapshot, Trace

# Least authoritative first. The last layer to touch the plate wins. This is the same
# arbitration as the prose spec's L3 -> L5 -> L2 -> L4 -> L1 ordering; expressing it as
# strict reverse-precedence removes the ambiguity about where L4 modifiers sit.
FOOD_CHAIN_ORDER = (4, 3, 2, 5, 1)


@dataclass
class _MealDraft:
    """A meal under construction. Carries its own removal log so every drop is attributable."""

    slot: str
    items: list[FoodItem] = field(default_factory=list)
    removed: list[dict[str, Any]] = field(default_factory=list)


def decide(
    snapshot: Snapshot,
    book: Rulebook | None = None,
    *,
    elemental_layer: bool | None = None,
) -> dict[str, Any]:
    book = book or load_rulebook()
    if elemental_layer is not None:
        book = book.with_elemental(elemental_layer)

    warnings: list[str] = []
    trace: list[Trace] = []

    _check_inputs(snapshot, book, warnings)

    fired: list[tuple[Rule, FiredRule]] = []
    for rule in sorted(book.rules, key=lambda r: r.priority):
        if not rule.enabled:
            continue
        if not book.elemental_layer_enabled and rule.layer not in book.validated_only_layers:
            trace.append(Trace("evaluate", rule.id, "suppressed: validated-biometrics-only mode"))
            continue

        verdict, reasons = rule_fires(rule, snapshot, book, warnings)
        if verdict is True:
            fired.append((rule, FiredRule(rule.id, rule.name, rule.layer, rule.priority, reasons)))
            trace.append(Trace("evaluate", rule.id, "fired: " + "; ".join(reasons)))
        elif verdict is None:
            trace.append(Trace("evaluate", rule.id, "unevaluable: " + "; ".join(reasons)))

    hormonal = [f for r, f in fired if r.layer == 2]
    if len(hormonal) > 1:
        warnings.append(
            "more than one Layer 2 rule fired (" + ", ".join(f.rule_id for f in hormonal) +
            ") — cycle-day ranges must be mutually exclusive"
        )

    activity = _resolve_activity(snapshot, fired, trace)
    food = _resolve_food(snapshot, fired, trace, warnings)
    supplements = _resolve_supplements(fired, trace)
    constraints = _resolve_constraints(fired, trace)

    always_on = book.always_on_layers()
    state = "calm" if all(rule.layer in always_on for rule, _ in fired) else "intervention"
    if any(w.startswith("cold start") for w in warnings):
        state = "insufficient_baseline"

    return {
        "schema_version": 1,
        "subject_ref": snapshot.subject_ref,
        "as_of": snapshot.as_of,
        "rulebook_version": book.version,
        "elemental_layer_enabled": book.elemental_layer_enabled,
        "state": state,
        "fired_rules": [f.to_dict() for _, f in fired],
        "activity": activity,
        "food": food,
        "supplements": supplements,
        "constraints": constraints,
        "messages": [r.message for r, _ in fired if r.message],
        "warnings": warnings,
        "trace": [t.to_dict() for t in trace],
    }


def _check_inputs(snapshot: Snapshot, book: Rulebook, warnings: list[str]) -> None:
    days = (snapshot.baselines or {}).get("days_of_history")
    if days is not None and days < book.min_days_for_baseline:
        warnings.append(
            f"cold start: {days} days of history against a minimum of "
            f"{book.min_days_for_baseline}; baseline-relative rules are not trustworthy yet"
        )

    cycle_day = (snapshot.cycle or {}).get("cycle_day")
    if cycle_day is not None and cycle_day > 28:
        warnings.append(
            f"cycle_day {cycle_day} is outside the 28-day model and UNDEFINED in rulebook "
            f"v{book.version} — no Layer 2 rule will fire. Needs a product decision."
        )


def _resolve_activity(
    snapshot: Snapshot,
    fired: list[tuple[Rule, FiredRule]],
    trace: list[Trace],
) -> dict[str, Any]:
    planned = (snapshot.planned_activity or {}).get("type")
    location = (snapshot.planned_activity or {}).get("location")

    candidates = [(rule, rule.activity) for rule, _ in fired if rule.activity.get("verdict")]
    if not candidates:
        return {"verdict": "allow", "planned": planned, "prescribed": planned,
                "location": location, "decided_by": None}

    # Most restrictive wins; ties broken by precedence (lower priority number).
    winner, effect = max(
        candidates,
        key=lambda pair: (VERDICT_RANK[pair[1]["verdict"]], -pair[0].priority),
    )
    verdict = effect["verdict"]

    prescribed = planned
    if verdict == "rest":
        prescribed = "rest"
    elif verdict == "substitute":
        prescribed = (effect.get("suggestions") or ["parasympathetic session"])[0]
    elif verdict == "downgrade":
        prescribed = (effect.get("downgrade_to") or ["walking"])[0]
    elif verdict == "relocate":
        location = effect.get("relocate_to", "indoor")

    # A relocate from a lower-precedence rule still applies to whatever survived above it.
    for rule, eff in candidates:
        if eff["verdict"] == "relocate" and rule is not winner:
            location = eff.get("relocate_to", location)
            trace.append(Trace("activity", rule.id, f"location moved to {location}"))

    trace.append(Trace("activity", winner.id,
                       f"verdict={verdict}; planned={planned!r} -> prescribed={prescribed!r}"))
    return {"verdict": verdict, "planned": planned, "prescribed": prescribed,
            "location": location, "decided_by": winner.id}


def _resolve_food(
    snapshot: Snapshot,
    fired: list[tuple[Rule, FiredRule]],
    trace: list[Trace],
    warnings: list[str],
) -> dict[str, Any]:
    meals = [
        _MealDraft(slot=meal.slot, items=[FoodItem(i.name, list(i.tags)) for i in meal.items])
        for meal in snapshot.planned_meals
    ]

    blocked: dict[str, str] = {}   # tag -> rule id that blocked it
    mandated: dict[str, str] = {}  # tag -> rule id that mandated it
    modifiers: dict[str, Any] = {
        "sodium_pct_delta": None, "hydration_pct_delta": None,
        "kcal_delta": None, "min_protein_g": None, "min_fiber_g": None,
    }

    by_layer = {layer: [(r, f) for r, f in fired if r.layer == layer] for layer in FOOD_CHAIN_ORDER}

    for layer in FOOD_CHAIN_ORDER:
        for rule, _ in sorted(by_layer[layer], key=lambda pair: pair[0].priority):
            effect = rule.food
            if not effect:
                continue

            for tag in effect.get("block_tags", []) or []:
                blocked[tag] = rule.id
                # A block always beats a mandate from a less authoritative layer.
                if tag in mandated:
                    trace.append(Trace("food", rule.id,
                                       f"block on '{tag}' overrides mandate from {mandated[tag]}"))
                    del mandated[tag]
                for meal in meals:
                    kept: list[FoodItem] = []
                    for item in meal.items:
                        if tag in item.tags:
                            meal.removed.append(
                                {"name": item.name, "rule_id": rule.id,
                                 "reason": f"blocked tag '{tag}'"})
                            trace.append(Trace("food", rule.id,
                                               f"removed {item.name!r} from {meal.slot} ('{tag}')"))
                        else:
                            kept.append(item)
                    meal.items = kept

            for tag in (effect.get("mandate_tags", []) or []) + (effect.get("add_tags", []) or []):
                if tag in blocked:
                    trace.append(Trace("food", rule.id,
                                       f"mandate '{tag}' suppressed — blocked by {blocked[tag]}"))
                    continue
                mandated[tag] = rule.id

            for item in effect.get("add_items", []) or []:
                tags = list(item.get("tags", []))
                collisions = [t for t in tags if t in blocked]
                target = _addition_slot(meals)
                target.items.append(FoodItem(item["name"], tags))
                trace.append(Trace("food", rule.id,
                                   f"added {item['name']!r} to {target.slot}"))
                if collisions:
                    # The ginger-for-a-Pitta case. L1 outranks L3 so the item stays, but the
                    # UI will read badly. Surface it; do not silently resolve it.
                    warnings.append(
                        f"{rule.id} added '{item['name']}' carrying tag(s) "
                        f"{collisions} blocked by {[blocked[t] for t in collisions]}. "
                        f"Higher layer wins by precedence — per-item substitution is unresolved."
                    )

            for key in ("sodium_pct_delta", "hydration_pct_delta", "kcal_delta",
                        "min_protein_g", "min_fiber_g"):
                if key in effect and effect[key] is not None:
                    modifiers[key] = effect[key]
                    trace.append(Trace("food", rule.id, f"{key} = {effect[key]}"))

    return {
        "meals": [{"slot": m.slot,
                   "items": [i.to_dict() for i in m.items],
                   "removed": m.removed} for m in meals],
        "mandated_tags": sorted(mandated),
        "blocked_tags": sorted(blocked),
        **modifiers,
    }


def _addition_slot(meals: list[_MealDraft]) -> _MealDraft:
    """Where rule-added items land.

    Deliberately a separate 'additions' slot rather than being folded into a planned meal:
    the user needs to see that the engine put something on their plate, and the execution
    layer needs to be able to notify on it independently.
    """
    for meal in meals:
        if meal.slot == "additions":
            return meal
    meal = _MealDraft(slot="additions")
    meals.append(meal)
    return meal


def _resolve_supplements(fired: list[tuple[Rule, FiredRule]], trace: list[Trace]) -> list[str]:
    out: list[str] = []
    for rule, _ in fired:
        for supplement in rule.supplements:
            if supplement not in out:
                out.append(supplement)
                trace.append(Trace("supplements", rule.id, f"added {supplement}"))
    return out


def _resolve_constraints(fired: list[tuple[Rule, FiredRule]], trace: list[Trace]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for rule, _ in sorted(fired, key=lambda pair: -pair[0].priority):
        for key, value in rule.constraints.items():
            out[key] = value  # higher precedence applied last, so it wins
            trace.append(Trace("constraints", rule.id, f"{key} = {value}"))
    return out
