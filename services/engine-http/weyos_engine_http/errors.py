"""Error responses that cannot leak a biometric.

This is the highest-risk file in the service, and the risk is a default rather than a bug we
might write. FastAPI's built-in ``RequestValidationError`` handler echoes the offending input:

    {"detail":[{"loc":["body","snapshot","biometrics","hrv_ms"],"msg":"...","input":61}]}

``"input": 61`` is a raw biometric in an error payload. Error payloads get logged, forwarded
and pasted into tickets. CLAUDE.md rule 5 and ``docs/compliance.md`` both forbid exactly this,
and the TypeScript side already gets it right — ``snapshot.validator.ts`` maps ajv errors to
``path + message`` with a comment saying never to echo the value back.

So every handler here returns STRUCTURE ONLY: a JSON pointer and a rule name. Never a value,
never ``str(exc)``. Two engine exceptions make that second rule concrete —
``read_signal`` raises ``KeyError(f"unknown signal '{signal}'...")`` and ``Snapshot.from_dict``
raises ``KeyError`` naming a field, both of which are safe, but a future exception might not
be, and a catch-all that stringifies is a leak waiting to happen.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("weyos.engine_http")


def _pointer(loc: tuple[Any, ...] | list[Any]) -> str:
    """Pydantic ``loc`` tuple -> JSON pointer. Field names only; no values."""
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    return "/" + "/".join(parts) if parts else "/"


def scrub_validation_error(exc: RequestValidationError) -> dict[str, Any]:
    """Strip everything but the location and the failing rule.

    Drops ``input`` (the offending value) and ``ctx`` (which can embed it too).
    """
    return {
        "error": "snapshot_invalid",
        "fields": [
            {"path": _pointer(e.get("loc", ())), "rule": str(e.get("type", "invalid"))}
            for e in exc.errors()
        ],
    }


def install(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        body = scrub_validation_error(exc)
        # Log the shape of the failure, never the payload.
        log.warning("snapshot_invalid fields=%s", [f["path"] for f in body["fields"]])
        return JSONResponse(status_code=422, content=body)

    @app.exception_handler(KeyError)
    async def _key_error(request: Request, exc: KeyError) -> JSONResponse:
        # KeyError's arg is a field or signal name — safe. Still routed through a fixed shape
        # rather than str(exc) so the contract does not depend on how it was raised.
        log.warning("malformed_snapshot key=%s", exc.args[0] if exc.args else "?")
        return JSONResponse(
            status_code=422,
            content={"error": "malformed_snapshot", "field": str(exc.args[0]) if exc.args else None},
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Type name only. NEVER str(exc): an exception message may carry a reading.
        log.error("unhandled %s", type(exc).__name__)
        return JSONResponse(
            status_code=500, content={"error": "engine_error", "kind": type(exc).__name__}
        )
