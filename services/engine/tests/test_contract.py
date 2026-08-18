"""The contract tests.

These fail when the engine and packages/shared-schema drift apart — which is the failure
mode that costs the most in a three-surface system, because it shows up as a runtime bug
on a device rather than a compile error.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from veyos_engine.config import RulebookError, load_rulebook

from .test_golden import GOLDEN, build_snapshot, run

jsonschema = pytest.importorskip("jsonschema")

SCHEMAS = Path(__file__).resolve().parents[3] / "packages" / "shared-schema" / "schemas"
SNAPSHOT_SCHEMA = json.loads((SCHEMAS / "signal-snapshot.schema.json").read_text(encoding="utf-8"))
DECISION_SCHEMA = json.loads((SCHEMAS / "decision.schema.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("fixture", GOLDEN, ids=[f["id"] for f in GOLDEN])
def test_fixture_inputs_match_the_published_schema(fixture: dict) -> None:
    jsonschema.validate(build_snapshot(fixture), SNAPSHOT_SCHEMA)


@pytest.mark.parametrize("fixture", GOLDEN, ids=[f["id"] for f in GOLDEN])
def test_decisions_match_the_published_schema(fixture: dict) -> None:
    jsonschema.validate(run(fixture), DECISION_SCHEMA)


def test_rulebook_invariants_hold() -> None:
    book = load_rulebook()
    assert book.version == 1
    assert len({r.priority for r in book.rules}) == len(book.rules)
    for rule in book.rules:
        assert rule.layer in book.layers


def test_duplicate_priorities_are_fatal(tmp_path: Path) -> None:
    """Two rules at the same priority make arbitration order-dependent. Never allow it."""
    bad = tmp_path / "rules.bad.yaml"
    bad.write_text(
        "version: 1\n"
        "features: {elemental_layer: true}\n"
        "baseline: {comparison_mode: percent}\n"
        "layers: {1: {name: A}}\n"
        "rules:\n"
        "  - {id: 'x', name: X, layer: 1, priority: 10,\n"
        "     when: {all: [{signal: dosha, op: eq, value: vata}]}}\n"
        "  - {id: 'y', name: Y, layer: 1, priority: 10,\n"
        "     when: {all: [{signal: dosha, op: eq, value: pitta}]}}\n",
        encoding="utf-8",
    )
    with pytest.raises(RulebookError, match="duplicate priorities"):
        load_rulebook(bad)


def test_unknown_food_tag_is_fatal(tmp_path: Path) -> None:
    """A rule may only block or mandate tags in the controlled vocabulary."""
    bad = tmp_path / "rules.bad.yaml"
    bad.write_text(
        "version: 1\n"
        "features: {elemental_layer: true}\n"
        "baseline: {comparison_mode: percent}\n"
        "layers: {3: {name: A}}\n"
        "rules:\n"
        "  - {id: '3.9', name: Z, layer: 3, priority: 49,"
        "     when: {all: [{signal: dosha, op: eq, value: vata}]},"
        "     effects: {food: {block_tags: [not_a_real_tag]}}}\n",
        encoding="utf-8",
    )
    with pytest.raises(RulebookError, match="controlled vocabulary"):
        load_rulebook(bad)
