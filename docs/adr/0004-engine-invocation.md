# ADR 0004 — How the API invokes the engine

Date: 2026-08-18 · **Accepted 2026-09-01**
Status: Accepted

## Context

The engine is Python; the API is Node. Options:

1. **Sidecar HTTP service.** Engine runs as a small FastAPI container; API calls it. Simple,
   language-appropriate, one more deployable.
2. **Queue.** API enqueues a snapshot; a Python worker computes and writes the decision.
   Natural fit for the execution layer's exactly-once requirement, more moving parts.
3. **Port the engine to TypeScript.** One runtime, but abandons the Python ecosystem for
   backtesting and re-implements 16 rules — a rewrite of the one component we most need to
   be correct.

## Decision

**Option 1 now; option 2 when the execution layer lands.**

The engine is pure and sub-millisecond, so an inline synchronous call is fine at MVP volume.
Option 3 was never seriously in contention: it would duplicate the arbitration logic in a
second language, and the backtest harness, the golden fixtures and the purity guarantees all
live in Python.

The seam that matters is not the transport — it is `EngineClient` in the API. When option 2
lands, that interface gets a different implementation and no controller moves.

## Where it lives, and why not inside `services/engine`

The sidecar is its own distribution at **`services/engine-http/`**, package
`weyos_engine_http`, depending on `weyos-engine` as a path dependency.

`docs/architecture.md` says "nothing in `services/engine` may import a network, database or
time library". A `services/engine/sidecar/` package would survive the spirit of that and die
on the letter: it would force FastAPI into the engine's `[tool.setuptools] packages`, and
therefore into the environment its `mypy --strict` gate runs in. Splitting the distributions
means `pip install -e "services/engine[dev]"` still never pulls a web framework — and CI can
*prove* it, because the two run as separate jobs. `tests/test_sidecar.py` also asserts on the
AST that no engine module imports anything networked.

## Consequences

**The rulebook loads once, at boot**, in the FastAPI lifespan, and is injected per call.
Loading per request would make throughput a function of YAML parsing and would make the
`rulebook_version` in a response non-authoritative. A rulebook change now requires a restart —
the right trade for a file that is meant to be a deliberate, reviewed edit.

**The sidecar may read a clock; the decision may not.** `as_of` always comes from the
snapshot. There is no code path where a server clock reaches a `Snapshot`.

**Paths are passed in, not inferred.** `weyos_engine.config` computes `REPO_ROOT` from
`__file__.parents[3]`, which is correct in a checkout and meaningless once installed to
`site-packages`. Worse, `_known_food_tags()` returns an empty set when `food-tags.json` is
missing and `_validate` then silently skips the controlled-vocabulary check — a container that
forgot to copy the schemas would boot happily with an unvalidated rulebook. `settings.py`
refuses to start instead.

**Responses are envelopes, not bare decisions.** See ADR 0006 for `decision_id` and the
envelope; the short version is that the nested `decision` is transmitted byte-for-byte
unmodified, which is what makes the id re-derivable and what lets the API validate it against
the published schema.

**Error payloads are scrubbed.** FastAPI's default `RequestValidationError` handler echoes the
offending input — `{"loc":[...,"hrv_ms"],"input":61}` is a raw biometric in an error body.
`errors.py` replaces every handler with one that returns a JSON pointer and a rule name and
nothing else, and never `str(exc)`. Two tests assert no persona value can appear in any error
response.

**No authentication.** The sidecar binds loopback by default and must never be published. The
API in front of it is the only thing that should reach it.

**Deployment is deferred.** The service runs locally via `make sidecar`. Containerising it is
DevOps work that the estimate has explicitly unallocated, and Stage 1 runs on fixtures.
