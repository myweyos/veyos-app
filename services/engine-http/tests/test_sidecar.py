"""Sidecar tests.

Four jobs:

1. **The acceptance criterion.** Every persona, both states, elemental on and off, produces a
   decision that validates against the published ``decision.schema.json``.
2. **Pass-through is byte-identical.** The HTTP layer adds nothing to the decision. That is
   what makes ``decision_id`` re-derivable by anyone holding the payload.
3. **No leakage.** No error response may contain a value from the snapshot. This is the
   FastAPI ``input``-echo regression test and it is the most valuable test in the service.
4. **The engine stays pure.** ``weyos_engine`` imports nothing networked, asserted on the AST.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from weyos_engine.config import load_rulebook
from weyos_engine.engine import decide
from weyos_engine.models import Snapshot

from weyos_engine_http import Settings, create_app, decision_id
from weyos_engine_http.presentation import classify_warning

REPO = Path(__file__).resolve().parents[3]
SCHEMAS = REPO / "packages" / "shared-schema" / "schemas"
DECISION_SCHEMA = json.loads((SCHEMAS / "decision.schema.json").read_text(encoding="utf-8"))
PERSONAS = json.loads((REPO / "packages" / "demo-fixtures" / "personas.json").read_text("utf-8"))
ENGINE_PKG = REPO / "services" / "engine" / "weyos_engine"

BOOK = load_rulebook()
CASES = [(p, s, e) for p in ("sarah", "james", "alex") for s in ("calm", "crash") for e in (True, False)]


def strip(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: strip(v) for k, v in value.items() if not k.startswith("$")}
    if isinstance(value, list):
        return [strip(v) for v in value]
    return value


def merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = json.loads(json.dumps(base))
    for k, v in patch.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def snapshot_for(persona: str, state: str) -> dict[str, Any]:
    raw = strip(PERSONAS[persona]["calm"])
    return merge(raw, strip(PERSONAS[persona]["crash"])) if state == "crash" else raw


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(create_app(Settings.from_env())) as c:
        yield c


# --------------------------------------------------------------------- acceptance criterion


@pytest.mark.parametrize(("persona", "state", "elemental"), CASES)
def test_decisions_validate_against_the_published_schema(
    client: TestClient, persona: str, state: str, elemental: bool
) -> None:
    jsonschema = pytest.importorskip("jsonschema")
    body = {"snapshot": snapshot_for(persona, state), "elemental_layer": elemental}
    response = client.post("/decide", json=body)
    assert response.status_code == 200, response.text
    payload = response.json()
    jsonschema.Draft202012Validator(DECISION_SCHEMA).validate(payload["decision"])


@pytest.mark.parametrize(("persona", "state", "elemental"), CASES)
def test_passthrough_is_byte_identical(
    client: TestClient, persona: str, state: str, elemental: bool
) -> None:
    """The HTTP layer must add nothing to the decision, or the id stops being re-derivable."""
    raw = snapshot_for(persona, state)
    direct = decide(Snapshot.from_dict(raw), BOOK, elemental_layer=elemental)
    served = client.post("/decide", json={"snapshot": raw, "elemental_layer": elemental}).json()
    assert served["decision"] == direct


# --------------------------------------------------------------------- identity


def test_decision_id_is_stable_and_derivable(client: TestClient) -> None:
    raw = snapshot_for("alex", "crash")
    first = client.post("/decide", json={"snapshot": raw}).json()
    second = client.post("/decide", json={"snapshot": raw}).json()
    assert first["decision_id"] == second["decision_id"]
    assert len(first["decision_id"]) == 16
    assert all(c in "0123456789abcdef" for c in first["decision_id"])
    # Anyone holding the payload can recompute it. That is the whole point of a content hash.
    assert decision_id(first["decision"]) == first["decision_id"]


def test_different_snapshots_get_different_ids(client: TestClient) -> None:
    a = client.post("/decide", json={"snapshot": snapshot_for("sarah", "calm")}).json()
    b = client.post("/decide", json={"snapshot": snapshot_for("sarah", "crash")}).json()
    assert a["decision_id"] != b["decision_id"]


def test_elemental_flag_changes_the_decision_and_the_id(client: TestClient) -> None:
    raw = snapshot_for("alex", "crash")
    on = client.post("/decide", json={"snapshot": raw, "elemental_layer": True}).json()
    off = client.post("/decide", json={"snapshot": raw, "elemental_layer": False}).json()
    assert on["decision_id"] != off["decision_id"]
    assert off["engine"]["elemental_layer_enabled"] is False
    # F11: validated-only mode is a real separation, not a UI filter.
    assert {r["layer"] for r in off["decision"]["fired_rules"]} <= {1, 2, 5}


# --------------------------------------------------------------------- no leakage


def all_snapshot_values() -> list[str]:
    """Every scalar in every persona, as a string. The needles for the leak test."""
    out: list[str] = []

    def walk(v: Any) -> None:
        if isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            out.append(str(v))

    walk(strip(PERSONAS))
    return [v for v in out if len(v) >= 2]


def test_validation_errors_never_echo_the_offending_value(client: TestClient) -> None:
    """FastAPI's default handler returns {"input": 61}. Ours must not.

    61 is an HRV reading. Error payloads get logged, forwarded and pasted into tickets.
    """
    response = client.post("/decide", json={"snapshot": {"biometrics": {"hrv_ms": 61}}})
    text = response.text
    assert response.status_code in (422, 500)
    assert "61" not in text, f"biometric leaked into an error payload: {text}"
    assert "input" not in text


def test_no_persona_value_appears_in_any_error_response(client: TestClient) -> None:
    """Table-driven over every reading in the fixtures."""
    broken = {"snapshot": {"subject_ref": "sub_leak0001", "biometrics": {"hrv_ms": "banana"}}}
    response = client.post("/decide", json=broken)
    text = response.text
    assert "banana" not in text, f"submitted value echoed: {text}"
    for value in all_snapshot_values():
        assert value not in text, f"{value} leaked into an error payload"


def test_malformed_snapshot_reports_a_field_not_a_value(client: TestClient) -> None:
    response = client.post("/decide", json={"snapshot": {"biometrics": {}}})
    assert response.status_code == 422
    body = response.json()
    assert body["error"] in ("snapshot_invalid", "malformed_snapshot")


# --------------------------------------------------------------------- health + purity


def test_healthz_carries_no_subject_data(client: TestClient) -> None:
    body = client.get("/healthz").json()
    assert body["status"] == "ok"
    assert body["rulebook_version"] == BOOK.version
    for banned in ("subject", "hrv", "rhr", "snapshot", "biometric"):
        assert banned not in json.dumps(body).lower()


def test_the_engine_imports_nothing_networked() -> None:
    """CLAUDE.md rule 1, made executable.

    The engine is pure. If a network, clock or randomness import ever lands in it, the
    reproducibility claim that makes a decision defensible goes with it.
    """
    banned = {
        "socket", "http", "urllib", "requests", "httpx", "aiohttp",
        "fastapi", "uvicorn", "starlette", "random", "secrets", "uuid",
    }
    for path in sorted(ENGINE_PKG.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for name in names:
                assert name.split(".")[0] not in banned, f"{path.name} imports {name}"


def test_batch_matches_single(client: TestClient) -> None:
    items = [{"snapshot": snapshot_for(p, "crash")} for p in ("sarah", "james", "alex")]
    batch = client.post("/decide/batch", json={"items": items}).json()["results"]
    for item, got in zip(items, batch, strict=True):
        assert got == client.post("/decide", json=item).json()


def test_warning_classification() -> None:
    assert classify_warning("cold start: 10 days of history") == "cold_start"
    assert classify_warning("cycle_day 31 ... UNDEFINED in rulebook v1") == "cycle_undefined"
    assert classify_warning("something new") == "uncategorised"


# --------------------------------------------------------------------- UNKNOWN end to end


def _served(client: TestClient, raw: dict[str, Any], elemental: bool = True) -> dict[str, Any]:
    response = client.post("/decide", json={"snapshot": raw, "elemental_layer": elemental})
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def test_a_missing_signal_reaches_the_client_as_unevaluable(client: TestClient) -> None:
    """Engine UNKNOWN → sidecar presentation.unevaluable_rule_ids, over HTTP.

    Alex's crash persona already has no deep/REM stage data, so 1.2 is unevaluable. Removing
    wrist temperature makes 1.3 unevaluable too, even though RHR is elevated. Neither rule
    fires, and the client can tell "couldn't evaluate" apart from "evaluated and didn't apply".
    Golden F17 pins the same case at the engine.
    """
    before = _served(client, snapshot_for("alex", "crash"))["presentation"]["unevaluable_rule_ids"]
    assert "1.2" in before and "1.3" not in before

    raw = merge(snapshot_for("alex", "crash"), {"biometrics": {"wrist_temp_delta_c": None}})
    body = _served(client, raw)
    fired = {r["rule_id"] for r in body["decision"]["fired_rules"]}
    assert {"1.2", "1.3"} <= set(body["presentation"]["unevaluable_rule_ids"])
    assert fired.isdisjoint({"1.2", "1.3"})


def test_a_false_condition_is_not_reported_as_unevaluable(client: TestClient) -> None:
    """all(UNKNOWN, FALSE) is FALSE. Golden F18."""
    raw = merge(snapshot_for("alex", "crash"),
                {"biometrics": {"wrist_temp_delta_c": None, "rhr_bpm": 60}})
    assert "1.3" not in _served(client, raw)["presentation"]["unevaluable_rule_ids"]


def test_unevaluable_and_suppressed_stay_separate(client: TestClient) -> None:
    """Validated-only mode switches layers off. That is 'suppressed', never 'unevaluable'.

    Merging the two lists would let a layer the user turned off read as a signal gap, or a
    real signal gap hide among layers that were never meant to run.
    """
    body = _served(client, snapshot_for("alex", "crash"), elemental=False)
    presentation = body["presentation"]
    assert "1.2" in presentation["unevaluable_rule_ids"]
    assert {"3.1", "3.2", "3.3", "4.1", "4.2", "4.3"} <= set(presentation["suppressed_rule_ids"])
    assert set(presentation["unevaluable_rule_ids"]).isdisjoint(presentation["suppressed_rule_ids"])


def test_not_applicable_is_currently_reported_as_unevaluable(client: TestClient) -> None:
    """CURRENT BEHAVIOUR, pinned. Open question: 'not applicable' vs 'unevaluable'.

    Alex tracks no cycle and has no labs. The design pack shows Layer 2 for him as "Not
    applicable to you" and Layer 5 as "no values" (screens C3/G3). Those are different from 1.2's
    missing sleep-stage data, which really is a gap today. The engine can't tell them apart: a
    missing cycle day and a lab never drawn are both a missing signal, so every 2.x and 5.x rule
    lands in unevaluable_rule_ids beside 1.2.

    Why it matters: if Partial meant "anything unevaluable", every user without labs and every
    subject without a cycle would be in Partial for good. The demo mapping works around that by
    counting Layer 1 only. That's the open question `partial-is-narrowed-to-layer-1` in
    packages/demo-fixtures/app-states.json, and this test is its evidence at the HTTP boundary.
    Not resolved here: the engine has no idea of applicability, and adding one means deciding
    what counts as not applicable.
    """
    unevaluable = set(_served(client, snapshot_for("alex", "crash"))["presentation"]["unevaluable_rule_ids"])
    assert {"2.1", "2.2", "2.3", "2.4"} <= unevaluable   # no cycle: not applicable to him
    assert {"5.1", "5.2", "5.3"} <= unevaluable          # no labs drawn: nothing to evaluate
    assert "1.2" in unevaluable                          # a real gap: no stage data today


def test_presentation_carries_facts_not_a_ui_state(client: TestClient) -> None:
    """No ui_state field. Its absence is the statement — see presentation.py."""
    body = client.post("/decide", json={"snapshot": snapshot_for("james", "crash")}).json()
    assert "ui_state" not in body and "ui_state" not in body["presentation"]
    assert set(body["presentation"]) == {
        "fired_layers",
        "unevaluable_rule_ids",
        "suppressed_rule_ids",
        "warning_kinds",
    }
