"""Command line entry point.

    python -m backtest run --synthetic
    python -m backtest run --snapshots ./corpus --json out.json
    python -m backtest generate --out ./corpus --grid quick

``run`` measures; ``generate`` materialises the synthetic corpus so it can be committed,
diffed or fed to something else. Neither writes to ``config/rules/``.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any

from veyos_engine.config import REPO_ROOT, Rulebook, load_rulebook

from .generate import AXIS_PARSERS, DEFAULT_GRID, GRIDS, SYNTHETIC_AS_OF, apply_overrides, generate
from .metrics import aggregate
from .questions import raise_observations, raise_questions
from .report import render_json, render_text
from .runner import Corpus, LoadError, iter_outcomes, load_directory

SNAPSHOT_SCHEMA_PATH = REPO_ROOT / "packages" / "shared-schema" / "schemas" / "signal-snapshot.schema.json"

# Writing a full boundary sweep is ~55k files. Worth an explicit "yes I meant that".
BULK_WRITE_THRESHOLD = 10_000


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--rulebook",
        type=Path,
        default=None,
        help="path to a rulebook YAML (default: config/rules/rules.v1.yaml)",
    )
    parser.add_argument(
        "--grid",
        choices=sorted(GRIDS),
        default=DEFAULT_GRID,
        help=f"synthetic sweep preset (default: {DEFAULT_GRID})",
    )
    parser.add_argument("--limit", type=int, default=None, help="stop after N snapshots")
    parser.add_argument("--as-of", default=SYNTHETIC_AS_OF, help="date stamped on synthetic snapshots")
    parser.add_argument(
        "--axis",
        action="append",
        default=[],
        metavar="NAME=v1,v2",
        help=(
            "override one sweep axis, repeatable. Axes: "
            + ", ".join(sorted(AXIS_PARSERS))
            + ". e.g. --axis cycle_day=none,29,31 to sweep the undefined cycle region"
        ),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m backtest",
        description="Run the Veyos rulebook over a corpus and report per-rule firing and co-firing.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="evaluate a corpus and print the report")
    _add_common(run)
    source = run.add_mutually_exclusive_group(required=True)
    source.add_argument("--snapshots", type=Path, help="directory of SignalSnapshot JSON files")
    source.add_argument(
        "--synthetic", action="store_true", help="sweep synthetic snapshots in memory"
    )
    run.add_argument(
        "--no-elemental",
        action="store_true",
        help="validated-biometrics-only mode (L1/L2/L5), as per features.validated_only_layers",
    )
    run.add_argument(
        "--comparison-mode",
        choices=["percent", "zscore"],
        default=None,
        help=(
            "override baseline.comparison_mode for this run only. Does NOT edit the rulebook. "
            "Note that no rule condition currently defines value_z, so zscore falls back to percent"
        ),
    )
    run.add_argument(
        "--validate",
        action="store_true",
        help="validate each snapshot against signal-snapshot.schema.json first (needs jsonschema)",
    )
    run.add_argument("--json", type=Path, default=None, help="also write the report as JSON")
    run.add_argument("--quiet", action="store_true", help="suppress the text report")

    gen = sub.add_parser("generate", help="write the synthetic corpus to disk")
    _add_common(gen)
    gen.add_argument("--out", type=Path, required=True, help="output directory")
    gen.add_argument(
        "--force",
        action="store_true",
        help=f"required when writing more than {BULK_WRITE_THRESHOLD} files",
    )

    return parser


def _load_book(path: Path | None, comparison_mode: str | None) -> Rulebook:
    book = load_rulebook(path) if path else load_rulebook()
    if comparison_mode is not None and comparison_mode != book.comparison_mode:
        # In-memory only. The rulebook file is never written by this tool.
        book = replace(book, baseline={**book.baseline, "comparison_mode": comparison_mode})
    return book


def command_generate(args: argparse.Namespace) -> int:
    axes = apply_overrides(GRIDS[args.grid], args.axis)
    count = axes.size() if args.limit is None else min(args.limit, axes.size())
    if count > BULK_WRITE_THRESHOLD and not args.force:
        print(
            f"refusing to write {count} files without --force "
            f"(grid '{args.grid}'). Use --limit or a smaller --grid.",
            file=sys.stderr,
        )
        return 2

    args.out.mkdir(parents=True, exist_ok=True)
    written = 0
    for snapshot_id, snapshot in generate(axes, as_of=args.as_of, limit=args.limit):
        (args.out / f"{snapshot_id}.json").write_text(
            json.dumps(snapshot, indent=2, sort_keys=True), encoding="utf-8"
        )
        written += 1
    print(f"wrote {written} snapshots to {args.out}  (grid '{args.grid}')")
    return 0


def command_run(args: argparse.Namespace) -> int:
    book = _load_book(args.rulebook, args.comparison_mode)
    elemental_enabled = False if args.no_elemental else book.elemental_layer_enabled

    errors: list[LoadError] = []
    meta: dict[str, Any] = {}

    if args.synthetic:
        axes = apply_overrides(GRIDS[args.grid], args.axis)
        label = f"synthetic sweep (grid '{args.grid}'"
        label += f", {len(args.axis)} axis override(s))" if args.axis else ")"
        corpus = Corpus(
            label=label,
            items=generate(axes, as_of=args.as_of, limit=args.limit),
            expected_count=axes.size(),
            errors=errors,
        )
        meta["grid"] = args.grid
        meta["axes"] = json.dumps(axes.describe(), sort_keys=True)
    else:
        directory: Path = args.snapshots
        if not directory.is_dir():
            print(f"not a directory: {directory}", file=sys.stderr)
            return 2
        corpus = Corpus(
            label=f"directory {directory}",
            items=load_directory(directory, errors=errors),
            errors=errors,
        )

    if args.comparison_mode is not None:
        meta["comparison_mode_override"] = args.comparison_mode

    schema: dict[str, Any] | None = None
    if args.validate:
        schema = json.loads(SNAPSHOT_SCHEMA_PATH.read_text(encoding="utf-8"))

    outcomes = iter_outcomes(book, corpus, elemental_layer=elemental_enabled, schema=schema)
    result = aggregate(
        book,
        outcomes,
        elemental_enabled=elemental_enabled,
        corpus_label=corpus.label,
        errors=errors,
        meta=meta,
    )

    questions = raise_questions(book, result)
    observations = raise_observations(book, result)

    if not args.quiet:
        print(render_text(result, questions, observations))
    if args.json:
        args.json.write_text(render_json(result, questions, observations), encoding="utf-8")
        if not args.quiet:
            print(f"\nJSON report written to {args.json}")

    if result.total == 0:
        print("no snapshots evaluated", file=sys.stderr)
        return 2
    return 1 if errors else 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "generate":
            return command_generate(args)
        return command_run(args)
    except ValueError as exc:
        # Bad --axis spec. Values here are sweep parameters the caller typed, not subject data.
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
