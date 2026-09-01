"""HTTP boundary for the Weyos arbitration engine.

Separate from ``services/engine`` on purpose. ``docs/architecture.md`` says "nothing in
``services/engine`` may import a network, database or time library", and it means the
directory, not just the module — so FastAPI and uvicorn live here, in their own distribution,
and the engine's install never pulls a web framework. CI runs the two as separate jobs, which
is what makes that claim checkable rather than aspirational.

Dependency direction is one-way: ``weyos_engine_http`` imports ``weyos_engine``, never the
reverse.
"""

from __future__ import annotations

from .app import create_app
from .health import describe
from .identity import canonical_json, decision_id
from .presentation import classify_warning, presentation
from .settings import ConfigurationError, Settings

__all__ = [
    "ConfigurationError",
    "Settings",
    "canonical_json",
    "classify_warning",
    "create_app",
    "decision_id",
    "describe",
    "presentation",
]
