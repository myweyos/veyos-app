"""Health payload.

Its own module so ``routes`` does not have to import from ``app``, which imports ``routes``.

Carries rulebook facts and nothing else — no subject data, by construction. A test asserts
that, because a health endpoint is the surface most likely to be scraped, logged and stored
by something nobody remembers configuring.
"""

from __future__ import annotations

from typing import Any

from weyos_engine.config import Rulebook


def describe(book: Rulebook) -> dict[str, Any]:
    return {
        "status": "ok",
        "rulebook_version": book.version,
        "rules": len(book.rules),
        "enabled_rules": sum(1 for r in book.rules if r.enabled),
        "elemental_layer_default": book.elemental_layer_enabled,
        "comparison_mode": book.comparison_mode,
    }
