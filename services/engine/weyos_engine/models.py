"""Typed view of the shared contract.

These dataclasses mirror ``packages/shared-schema/schemas/signal-snapshot.schema.json``.
The JSON Schema is the source of truth; ``tests/test_contract.py`` asserts that every
fixture validates against it, so drift between this file and the schema fails CI.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Dosha = Literal["vata", "pitta", "kapha"]
Intensity = Literal["rest", "low", "moderate", "high", "max"]
Verdict = Literal["allow", "downgrade", "substitute", "relocate", "rest"]

# Most-restrictive-wins ordering for activity resolution.
VERDICT_RANK: dict[str, int] = {
    "allow": 0,
    "relocate": 1,
    "downgrade": 2,
    "substitute": 3,
    "rest": 4,
}


@dataclass(frozen=True)
class LabValue:
    status: str = "unknown"
    value: float | None = None
    unit: str | None = None
    collected_on: str | None = None


@dataclass
class FoodItem:
    name: str
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "tags": list(self.tags)}


@dataclass
class Meal:
    slot: str
    items: list[FoodItem] = field(default_factory=list)


@dataclass
class Snapshot:
    """The canonical normalised signal payload for one subject on one day."""

    subject_ref: str
    as_of: str
    dosha: Dosha
    schema_version: int = 1
    timezone: str | None = None
    biometrics: dict[str, Any] = field(default_factory=dict)
    baselines: dict[str, Any] = field(default_factory=dict)
    cycle: dict[str, Any] = field(default_factory=dict)
    environment: dict[str, Any] = field(default_factory=dict)
    labs: dict[str, LabValue] = field(default_factory=dict)
    planned_activity: dict[str, Any] = field(default_factory=dict)
    planned_meals: list[Meal] = field(default_factory=list)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> Snapshot:
        labs = {
            key: LabValue(**value)
            for key, value in (raw.get("labs") or {}).items()
            if value is not None
        }
        meals = [
            Meal(
                slot=meal["slot"],
                items=[FoodItem(name=i["name"], tags=list(i.get("tags", []))) for i in meal["items"]],
            )
            for meal in (raw.get("planned_meals") or [])
        ]
        return cls(
            subject_ref=raw["subject_ref"],
            as_of=raw["as_of"],
            dosha=raw["constitution"]["dosha"],
            schema_version=raw.get("schema_version", 1),
            timezone=raw.get("timezone"),
            biometrics=raw.get("biometrics") or {},
            baselines=raw.get("baselines") or {},
            cycle=raw.get("cycle") or {},
            environment=raw.get("environment") or {},
            labs=labs,
            planned_activity=raw.get("planned_activity") or {},
            planned_meals=meals,
        )


@dataclass
class FiredRule:
    rule_id: str
    name: str
    layer: int
    priority: int
    because: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "name": self.name,
            "layer": self.layer,
            "priority": self.priority,
            "because": list(self.because),
        }


@dataclass
class Trace:
    step: str
    rule_id: str
    detail: str

    def to_dict(self) -> dict[str, Any]:
        return {"step": self.step, "rule_id": self.rule_id, "detail": self.detail}
