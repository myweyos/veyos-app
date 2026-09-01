"""Decision identity.

``decision.schema.json`` carries no id field, but the trace screen needs one — the design
shows ``decision 8f2a…c91``. Rather than change the contract, the id is derived from the
decision's own content and carried in an envelope around it.

**Why a content hash works here.** The engine is pure and its determinism is *proved*, not
assumed: ``tests/test_golden.py::test_engine_is_deterministic`` asserts byte-identical
``json.dumps(..., sort_keys=True)`` across runs for every fixture. So the same snapshot
against the same rulebook yields the same id on any machine, in any process, with no store.

**Why it is computed exactly once, here, in Python.** Python's ``json.dumps`` and JavaScript's
``JSON.stringify`` disagree on number formatting (``40.0`` vs ``40``), on ``-0``, and on
non-ASCII escaping. Two implementations would drift, and the drift would be invisible until an
id failed to resolve. The API treats this value as opaque; a CI grep forbids ``createHash`` in
``services/api/src``.

**What it is not.** This is *content* identity, not *delivery* identity. The same person on
two identical days gets the same id — correct for "which decision is this", wrong for "which
notification was this". The execution layer's exactly-once event id is a separate concern.
That said, a content hash is a natural idempotency key for exactly-once dispatch, which is a
point in its favour when ADR 0004 moves to a queue.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

ID_LENGTH = 16


def canonical_json(decision: dict[str, Any]) -> bytes:
    """Byte form the id is computed over. Sorted keys, no incidental whitespace."""
    return json.dumps(decision, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def decision_id(decision: dict[str, Any]) -> str:
    """Stable 16-hex-character id for a decision's content."""
    return hashlib.sha256(canonical_json(decision)).hexdigest()[:ID_LENGTH]
