"""Running the rulebook over a corpus.

The harness deliberately drives the real ``decide()`` rather than calling ``rule_fires()``
itself. Re-implementing the enabled/suppressed gating here would let the harness and the
engine drift, and a backtest that measures a slightly different engine than the one that
ships is worse than no backtest.

Per-rule outcome is recovered from the decision the engine already returns:

* **fired**       — the rule ids in ``decision["fired_rules"]``
* **unevaluable** — trace rows whose detail starts ``unevaluable:`` (a condition was UNKNOWN)
* **suppressed**  — trace rows whose detail starts ``suppressed:`` (validated-only mode)
* **disabled**    — carries no trace at all; taken from the rulebook
* **not fired**   — everything left over: the rule was evaluated and came out FALSE

Those three trace prefixes are a coupling to ``engine.py``. ``tests/test_backtest.py`` pins
them, so if the engine restyles its trace the harness fails loudly instead of quietly
reporting that nothing was ever unevaluable.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from veyos_engine.config import Rulebook
from veyos_engine.engine import decide
from veyos_engine.models import Snapshot

TRACE_STEP_EVALUATE = "evaluate"
TRACE_FIRED = "fired"
TRACE_UNEVALUABLE = "unevaluable"
TRACE_SUPPRESSED = "suppressed"


@dataclass(frozen=True)
class SnapshotOutcome:
    """What one snapshot did to the rulebook."""

    snapshot_id: str
    state: str
    fired: frozenset[str]
    unevaluable: frozenset[str]
    suppressed: frozenset[str]
    activity_verdict: str
    activity_decided_by: str | None
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class LoadError:
    """A snapshot that could not be read.

    ``detail`` is deliberately structural — a JSON path, a field name, an exception class.
    Never a value. These records are printed, and CLAUDE.md's rule 5 (no raw biometrics in
    logs or error messages) applies to the harness exactly as it applies to the engine.
    """

    path: str
    kind: str
    detail: str


@dataclass
class Corpus:
    """A source of snapshots plus wherever it came from, for the report header."""

    label: str
    items: Iterable[tuple[str, dict[str, Any]]]
    expected_count: int | None = None
    errors: list[LoadError] = field(default_factory=list)


def strip_meta_keys(value: Any) -> Any:
    """Drop ``$``-prefixed annotation keys (``$comment`` and friends).

    Fixture and hand-written snapshot files carry them; the JSON Schema sets
    ``additionalProperties: false``, so they have to come out before validation.
    """
    if isinstance(value, dict):
        return {k: strip_meta_keys(v) for k, v in value.items() if not k.startswith("$")}
    if isinstance(value, list):
        return [strip_meta_keys(v) for v in value]
    return value


def load_directory(
    directory: Path,
    *,
    errors: list[LoadError],
    pattern: str = "**/*.json",
) -> Iterator[tuple[str, dict[str, Any]]]:
    """Yield ``(id, raw_snapshot)`` for every JSON file under ``directory``.

    Sorted by path so a run over the same directory is reproducible. A file that will not
    parse is recorded in ``errors`` and skipped rather than killing the run — a corpus of
    ten thousand snapshots should not be lost to one bad file.
    """
    for path in sorted(directory.glob(pattern)):
        if not path.is_file():
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            # lineno/colno only — the surrounding document is not quoted back.
            errors.append(
                LoadError(str(path), "invalid_json", f"line {exc.lineno} column {exc.colno}")
            )
            continue
        except OSError as exc:
            errors.append(LoadError(str(path), "unreadable", type(exc).__name__))
            continue

        if not isinstance(raw, dict):
            errors.append(LoadError(str(path), "not_an_object", "top level is not a JSON object"))
            continue

        yield path.stem, strip_meta_keys(raw)


def validate_snapshot(raw: dict[str, Any], schema: dict[str, Any]) -> str | None:
    """Return a *structural* description of the first schema violation, or None.

    Returns the JSON path and the failing keyword, never ``exc.message`` — that string
    interpolates the offending instance, which for this schema means a biometric value.
    """
    import jsonschema  # local: only needed with --validate, and it is a dev-extra dependency

    validator = jsonschema.Draft202012Validator(schema)
    for error in validator.iter_errors(raw):
        return f"{error.json_path} failed '{error.validator}'"
    return None


def iter_outcomes(
    book: Rulebook,
    corpus: Corpus,
    *,
    elemental_layer: bool | None = None,
    schema: dict[str, Any] | None = None,
) -> Iterator[SnapshotOutcome]:
    """Decide every snapshot in ``corpus`` and yield its outcome.

    Streaming on purpose: the aggregator folds these as they arrive, so a corpus larger
    than memory is fine.
    """
    for snapshot_id, raw in corpus.items:
        if schema is not None:
            problem = validate_snapshot(raw, schema)
            if problem is not None:
                corpus.errors.append(LoadError(snapshot_id, "schema_violation", problem))
                continue
        try:
            snapshot = Snapshot.from_dict(raw)
        except (KeyError, TypeError) as exc:
            # KeyError/TypeError here carry a field or keyword name, not a reading.
            corpus.errors.append(LoadError(snapshot_id, "malformed_snapshot", f"{type(exc).__name__}: {exc}"))
            continue

        decision = decide(snapshot, book, elemental_layer=elemental_layer)
        yield _outcome(snapshot_id, decision)


def _outcome(snapshot_id: str, decision: dict[str, Any]) -> SnapshotOutcome:
    unevaluable: set[str] = set()
    suppressed: set[str] = set()

    for row in decision["trace"]:
        if row["step"] != TRACE_STEP_EVALUATE:
            continue
        prefix = row["detail"].split(":", 1)[0].strip()
        if prefix == TRACE_UNEVALUABLE:
            unevaluable.add(row["rule_id"])
        elif prefix == TRACE_SUPPRESSED:
            suppressed.add(row["rule_id"])

    activity = decision["activity"]
    return SnapshotOutcome(
        snapshot_id=snapshot_id,
        state=decision["state"],
        fired=frozenset(rule["rule_id"] for rule in decision["fired_rules"]),
        unevaluable=frozenset(unevaluable),
        suppressed=frozenset(suppressed),
        activity_verdict=activity["verdict"],
        activity_decided_by=activity["decided_by"],
        warnings=tuple(decision["warnings"]),
    )
