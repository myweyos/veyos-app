"""The FastAPI application.

Everything network-facing lives here so that ``services/engine`` stays what
``docs/architecture.md`` says it is: a package that imports no network, database or time
library. The engine is a pure function; this is a thin shell around it.

The rulebook is loaded ONCE, in the lifespan, and injected into every call. Loading per
request would make throughput a function of YAML parsing and would make the
``rulebook_version`` in a response non-authoritative. A rulebook change therefore requires a
restart, which is the correct trade for a file that is supposed to be a deliberate,
reviewed edit.

The sidecar may read a clock. The DECISION must not: ``as_of`` always comes from the
snapshot, and there is no code path where a server clock reaches a ``Snapshot``.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from weyos_engine.config import Rulebook, load_rulebook

from . import errors
from .routes import router
from .settings import Settings

log = logging.getLogger("weyos.engine_http")


class EngineState:
    """Boot-time state, hung off ``app.state``."""

    def __init__(self, settings: Settings, book: Rulebook) -> None:
        self.settings = settings
        self.book = book


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or Settings.from_env()
    resolved.validate()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        book = load_rulebook(resolved.rulebook_path)
        app.state.engine = EngineState(resolved, book)
        # Rule ids and counts only — never a threshold, never a subject.
        log.info(
            "rulebook loaded version=%s rules=%d elemental=%s",
            book.version,
            len(book.rules),
            book.elemental_layer_enabled,
        )
        yield

    app = FastAPI(
        title="Weyos engine",
        version="0.1.0",
        summary="HTTP boundary for the pure arbitration engine.",
        lifespan=lifespan,
        # No docs in a service that has no auth and should never be published.
        docs_url=None,
        redoc_url=None,
    )
    errors.install(app)
    app.include_router(router)
    return app


