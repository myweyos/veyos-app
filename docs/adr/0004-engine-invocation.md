# ADR 0004 — How the API invokes the engine

Date: 2026-08-18
Status: PROPOSED — do not implement until decided

## Context

The engine is Python; the API is Node. Options:

1. **Sidecar HTTP service.** Engine runs as a small FastAPI container; API calls it. Simple,
   language-appropriate, one more deployable.
2. **Queue.** API enqueues a snapshot; a Python worker computes and writes the decision.
   Natural fit for the execution layer's exactly-once requirement, more moving parts.
3. **Port the engine to TypeScript.** One runtime, but abandons the Python ecosystem for
   backtesting and re-implements 16 rules — a rewrite of the one component we most need to
   be correct.

## Recommendation

(1) to start, (2) when the execution layer lands. The engine is pure and sub-millisecond;
inline synchronous calls are fine at MVP volume. Revisit when notification delivery
semantics force a queue anyway.

## Status

Open. `services/api/src/ingestion/ingestion.controller.ts` has a TODO pointing here.
Do not resolve it by writing code.
