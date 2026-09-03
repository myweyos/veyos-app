# ADR 0006 — Decision identity and the response envelope

Date: 2026-09-02
Status: Accepted

## Context

`decision.schema.json` carries no id field. The trace screen needs one — the design pack shows
`decision 8f2a…c91` in C3's provenance line — and `GET /v1/decision/:id/trace` cannot exist
without one.

Clients also need facts the Decision does not carry in a machine-readable form. The set of
unevaluable rules exists only as trace rows whose `detail` starts `unevaluable:`; warning kinds
exist only as prose. Making every client parse those strings would spread engine coupling
across three surfaces.

## Decision

**Derive the id from the decision's content. Do not add a field to `decision.json`.**

```
decision_id = sha256(json.dumps(decision, sort_keys=True, separators=(",", ":")))[:16]
```

Carried in a new **envelope** around the untouched decision:

```jsonc
{ "envelope_version": 1, "decision_id": "...", "decision": { … }, "presentation": { … }, "engine": { … } }
```

New file `packages/shared-schema/schemas/decision-envelope.schema.json`. `decision.json` is
unchanged and its `schema_version` stays `1`.

## Alternatives considered

**Add `decision_id` to the Decision.** Rejected on two counts. *Who mints it?* If the engine
does, it needs `uuid`, `secrets` or a clock — a direct violation of the purity rule that makes
a decision reproducible from a stored snapshot plus a rulebook version. The only pure option is
for the engine to hash its own output, which is circular and pushes an identity concern into a
function whose entire value is being `(Snapshot, Rulebook) -> Decision`. *And required-vs-optional
is a trap either way:* required is breaking, forcing `schema_version` to 2, changing `const: 1`
in both schemas plus `SCHEMA_VERSION`, `models.py` and every fixture, and demanding an answer to
"how are old clients handled". Optional is backwards-compatible but then `/decision/:id/trace`
cannot rely on the field existing, which defeats the point.

**A UUID minted at the API.** Rejected: it needs a store to be resolvable, and there is no
persistence yet. It also makes the id un-derivable, so a client holding a payload cannot check
that the id matches the decision it came with.

## Why a content hash works here

The engine's determinism is *proved*, not assumed. `tests/test_golden.py::test_engine_is_deterministic`
asserts byte-identical `json.dumps(..., sort_keys=True)` across runs for every fixture. So the
same snapshot against the same rulebook yields the same id on any machine, in any process, with
no coordination and no store — which is exactly what `/decision/:id/trace` needs today.

Supporting evidence that this is the intended shape: the design shows a truncated hex string,
first-four-then-last-three, not a UUID and not a sequence.

## Consequences

**Computed exactly once, in Python.** Python's `json.dumps` and JavaScript's `JSON.stringify`
disagree on number formatting (`40.0` vs `40`), on `-0`, and on non-ASCII escaping. Two
implementations would drift, and the drift would be invisible until an id failed to resolve. A
CI grep forbids `createHash`/`sha256` in `services/api/src`.

**The nested decision must be transmitted byte-for-byte unmodified.** If anything in the chain
mutates it, the id stops being re-derivable and validating `body.decision` against
`decision.json` stops proving anything about the engine. `test_passthrough_is_byte_identical`
covers it.

**Content identity, not delivery identity.** The same person on two identical days gets the same
id. That is correct for "which decision is this" and wrong for "which notification was this" —
the execution layer's exactly-once event id is a separate concern. The upside: a content hash is
a natural idempotency key for exactly-once dispatch, which is a point in its favour when ADR 0004
moves to a queue.

**The id is subject-linkable.** It is not reversible and is not a biometric, but it is a stable
identifier derived from Art.9-adjacent content. It belongs in the same retention class as
`subject_ref`. It is safe to log; the snapshot is not.

**`presentation` carries no `ui_state`, deliberately.** The engine emits three states
(`calm | intervention | insufficient_baseline`); the product design needs six. Every plausible
mapping silently resolves an open spec question: `calm → "in balance"` renders the James gap as
reassurance, which fixture F5 pins as a known defect, and any advisory-versus-intervention split
is a severity rule that exists nowhere in `config/rules/`. So the envelope returns facts and the
mapping stays in `packages/demo-fixtures/app-states.json`, where it is reviewable data with its
open questions attached.

**Warning classification is fragile and known to be.** The kinds are derived by substring-matching
prose emitted from five places in `engine.py` and `evaluate.py`. Doing it in Python beside the
engine means the same golden fixtures cover both, but the durable fix is a structured `code` on
each warning — a `decision.json` change, and its own ADR.

## CONTRIBUTING checklist

1. **ADR** — this document.
2. **Regenerate TS types** — a no-op today. `packages/shared-schema/src/index.ts` is hand-written
   pending VEY-SCHEMA-GEN, so `DecisionEnvelope` is hand-written alongside the others under the
   same "delete when generation lands" banner. Stated rather than skipped silently.
3. **Engine contract tests pass** — unchanged, and that is the point: `decision.json` did not move.
4. **`schema_version` bump** — not required. Purely additive; no existing field changed, so no
   client in the field is affected.
