"""The percent-vs-z-score comparison harness (SCRUM-74)."""

from __future__ import annotations

from pathlib import Path

from backtest.compare import baseline_relative_rules, compare_modes
from backtest.generate import GRIDS, apply_overrides, generate
from backtest.overlay import apply_value_z, load_value_z
from weyos_engine.config import REPO_ROOT, load_rulebook

PROPOSAL = REPO_ROOT / "config" / "rules" / "proposals" / "value_z.candidates.yaml"
BOOK = load_rulebook()


def test_overlay_adds_value_z_only_to_baseline_relative_conditions() -> None:
    book, notes = apply_value_z(BOOK, load_value_z(PROPOSAL))
    assert notes == []
    by_id = {r.id: r for r in book.rules}
    assert by_id["1.1"].when["all"][0]["value_z"] == 2.0
    # 1.3's temperature condition is not baseline-relative; only its RHR condition gets a z.
    assert [c.get("value_z") for c in by_id["1.3"].when["all"]] == [None, 1.0]
    assert "value_z" not in str(by_id["2.1"].when)
    # The product rulebook itself is untouched.
    assert "value_z" not in str(BOOK.rules)


def test_overlay_reports_entries_that_match_nothing() -> None:
    _, notes = apply_value_z(BOOK, {"1.1": {"steps": 1.0}, "9.9": {"hrv_ms": 1.0}})
    assert len(notes) == 2


def test_modes_agree_at_stock_variability_and_diverge_off_it() -> None:
    """The candidates are calibrated to stock; every disagreement must be a non-stock subject."""
    book, _ = apply_value_z(BOOK, load_value_z(PROPOSAL))
    axes = apply_overrides(GRIDS["quick"], ["variability=stock,steady,variable"])
    items = list(generate(axes))
    result = compare_modes(book, items, elemental_layer=None, notes=[])
    assert result.total == axes.size()
    rules = {r.rule_id: r for r in result.rules}
    assert set(rules) == set(baseline_relative_rules(BOOK)) == {"1.1", "1.2", "1.3", "1.4"}
    for r in result.rules:
        assert "stock" not in r.by_variability, f"{r.rule_id} disagreed at stock variability"
    assert rules["1.1"].percent_only > 0 or rules["1.1"].zscore_only > 0, "the axis must bite"
    # 1.2 has no SD in the schema, so it is percent in both modes and can never disagree.
    assert rules["1.2"].percent_only == 0 and rules["1.2"].zscore_only == 0


def test_without_an_overlay_the_modes_are_identical() -> None:
    items = list(generate(GRIDS["quick"], limit=200))
    result = compare_modes(BOOK, items, elemental_layer=None, notes=[])
    assert all(r.percent_only == 0 and r.zscore_only == 0 for r in result.rules)
    assert result.zscore_fallbacks > 0


def test_proposal_file_is_where_the_adr_says() -> None:
    assert PROPOSAL.exists()
    assert (Path(REPO_ROOT) / "docs" / "adr" / "0010-baseline-comparison-mode.md").exists()
