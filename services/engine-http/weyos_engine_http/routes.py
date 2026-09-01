"""Routes.

Two endpoints, and deliberately no more. The sidecar is a pure function over HTTP: it knows
nothing about personas, demos, persistence or who is asking. Everything product-shaped lives
in the API in front of it.

``/decide`` returns an ENVELOPE, not a bare decision:

    {envelope_version, decision_id, decision, presentation, engine}

The nested ``decision`` is the engine's output transmitted byte-for-byte unmodified. That is
load-bearing twice over: it is what makes ``decision_id`` re-derivable by anyone holding the
payload, and it is what lets the API validate ``body.decision`` against the published
``decision.schema.json`` and have that mean something.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from weyos_engine.engine import decide
from weyos_engine.models import Snapshot

from .health import describe
from .identity import decision_id
from .presentation import presentation

router = APIRouter()

ENVELOPE_VERSION = 1


class DecideRequest(BaseModel):
    # `dict` rather than a typed model on purpose: signal-snapshot.schema.json is the source of
    # truth and it is validated at the API boundary before it ever reaches here. Restating the
    # shape as pydantic would be a second, drifting definition of the contract.
    snapshot: dict[str, Any]
    elemental_layer: bool | None = Field(
        default=None,
        description="Override the rulebook's features.elemental_layer for this call only.",
    )


class BatchRequest(BaseModel):
    items: list[DecideRequest]


def _decide_one(request: Request, item: DecideRequest) -> dict[str, Any]:
    book = request.app.state.engine.book
    snapshot = Snapshot.from_dict(item.snapshot)
    decision = decide(snapshot, book, elemental_layer=item.elemental_layer)
    return {
        "envelope_version": ENVELOPE_VERSION,
        "decision_id": decision_id(decision),
        "decision": decision,
        "presentation": presentation(decision),
        "engine": {
            "rulebook_version": decision["rulebook_version"],
            "elemental_layer_enabled": decision["elemental_layer_enabled"],
        },
    }


@router.post("/decide")
def post_decide(request: Request, body: DecideRequest) -> dict[str, Any]:
    return _decide_one(request, body)


@router.post("/decide/batch")
def post_decide_batch(request: Request, body: BatchRequest) -> dict[str, Any]:
    """Decide several snapshots in one call.

    Exists so the API can warm its decision cache at boot in a single round trip rather than
    N. The engine is sub-millisecond, so the HTTP overhead dominates.
    """
    return {"results": [_decide_one(request, item) for item in body.items]}


@router.get("/healthz")
def healthz(request: Request) -> dict[str, Any]:
    return describe(request.app.state.engine.book)
