"""Rulebook loading.

The rulebook is data (``config/rules/rules.vN.yaml``). This module turns it into typed
objects and validates the invariants that must hold for arbitration to be meaningful —
unique ids, known layers, unique priorities, and no rule whose effects reference a food
tag outside the controlled vocabulary.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RULEBOOK = REPO_ROOT / "config" / "rules" / "rules.v1.yaml"
FOOD_TAGS = REPO_ROOT / "packages" / "shared-schema" / "schemas" / "food-tags.json"


class RulebookError(ValueError):
    """The rulebook is internally inconsistent. Always fatal — never degrade gracefully."""


@dataclass(frozen=True)
class Rule:
    id: str
    name: str
    layer: int
    priority: int
    when: dict[str, Any]
    effects: dict[str, Any] = field(default_factory=dict)
    enabled: bool = True

    @property
    def activity(self) -> dict[str, Any]:
        return self.effects.get("activity") or {}

    @property
    def food(self) -> dict[str, Any]:
        return self.effects.get("food") or {}

    @property
    def supplements(self) -> list[str]:
        return list(self.effects.get("supplements") or [])

    @property
    def constraints(self) -> dict[str, Any]:
        return self.effects.get("constraints") or {}

    @property
    def message(self) -> str | None:
        return self.effects.get("message")


@dataclass(frozen=True)
class Rulebook:
    version: int
    features: dict[str, Any]
    baseline: dict[str, Any]
    layers: dict[int, dict[str, Any]]
    rules: tuple[Rule, ...]

    @property
    def elemental_layer_enabled(self) -> bool:
        return bool(self.features.get("elemental_layer", True))

    @property
    def validated_only_layers(self) -> set[int]:
        return set(self.features.get("validated_only_layers", [1, 2, 5]))

    @property
    def comparison_mode(self) -> str:
        return str(self.baseline.get("comparison_mode", "percent"))

    @property
    def min_days_for_baseline(self) -> int:
        return int(self.baseline.get("min_days_for_baseline", 28))

    def always_on_layers(self) -> set[int]:
        return {layer for layer, meta in self.layers.items() if meta.get("always_on")}

    def with_elemental(self, enabled: bool) -> Rulebook:
        """Return the same rulebook with the elemental layer toggled.

        Used by the product feature flag and by fixture F11, which proves that
        'validated biometrics only' mode is a real separation and not a UI filter.
        """
        return Rulebook(
            version=self.version,
            features={**self.features, "elemental_layer": enabled},
            baseline=self.baseline,
            layers=self.layers,
            rules=self.rules,
        )


def load_rulebook(path: Path | str = DEFAULT_RULEBOOK) -> Rulebook:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    layers = {int(k): v for k, v in (raw.get("layers") or {}).items()}

    rules: list[Rule] = []
    for entry in raw.get("rules") or []:
        rules.append(
            Rule(
                id=str(entry["id"]),
                name=entry.get("name", entry["id"]),
                layer=int(entry["layer"]),
                priority=int(entry["priority"]),
                when=entry.get("when") or {},
                effects=entry.get("effects") or {},
                enabled=bool(entry.get("enabled", True)),
            )
        )

    book = Rulebook(
        version=int(raw["version"]),
        features=raw.get("features") or {},
        baseline=raw.get("baseline") or {},
        layers=layers,
        rules=tuple(rules),
    )
    _validate(book)
    return book


def _validate(book: Rulebook) -> None:
    ids = [rule.id for rule in book.rules]
    if len(ids) != len(set(ids)):
        raise RulebookError("duplicate rule ids in rulebook")

    priorities = [rule.priority for rule in book.rules]
    if len(priorities) != len(set(priorities)):
        raise RulebookError(
            "duplicate priorities: arbitration would be order-dependent, which makes the "
            "engine non-deterministic across YAML edits"
        )

    for rule in book.rules:
        if rule.layer not in book.layers:
            raise RulebookError(f"rule {rule.id} declares unknown layer {rule.layer}")
        if not rule.when.get("all") and not rule.when.get("any"):
            raise RulebookError(f"rule {rule.id} has no conditions")

    known = _known_food_tags()
    if known:
        for rule in book.rules:
            for key in ("block_tags", "mandate_tags", "add_tags"):
                for tag in rule.food.get(key, []) or []:
                    if tag not in known:
                        raise RulebookError(
                            f"rule {rule.id} references food tag '{tag}' which is not in the "
                            f"controlled vocabulary (packages/shared-schema/schemas/food-tags.json)"
                        )


def _known_food_tags() -> set[str]:
    if not FOOD_TAGS.exists():
        return set()
    data = json.loads(FOOD_TAGS.read_text(encoding="utf-8"))
    tags: set[str] = set()
    for key, value in data.items():
        if key.startswith("$") or key == "version":
            continue
        tags.update(value)
    return tags
