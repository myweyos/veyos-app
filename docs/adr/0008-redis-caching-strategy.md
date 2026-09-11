# ADR 0008 — Redis caching strategy

**Status:** Accepted  
**Date:** 2026-09-11  
**Ticket:** SCRUM-73

---

## Context

Phase 2 introduces real signal ingestion against Postgres + TimescaleDB (ADR 0007). Two read
paths inside the hot ingestion pipeline hit Postgres on every request:

1. **`BaselineComputationService.computeFor()`** — reads 14 rows from `signal_snapshots` to
   compute the rolling mean for HRV, RHR and sleep. This runs on every `POST /v1/ingest/snapshot`
   for the same `(subject_ref, as_of)` pair regardless of whether the input has changed.

2. **`DecisionService.byDecisionId()`** — the previous in-process `Map<string, DecisionEnvelope>`
   did not survive process restarts and would not survive horizontal scaling.

Redis 7 is already declared in `docker-compose.yml` and `REDIS_URL` is already in `.env`.

## Decision

Introduce a shared Redis client (`ioredis` 5) via a `@Global()` NestJS module (`RedisModule`) that
follows the same factory-provider pattern as `DatabaseModule`. The client is injected `@Optional()`
into consumers so the application starts without Redis (e.g. some unit-test setups).

### Client library: `ioredis` 5

Same rationale as choosing `postgres.js` over TypeORM in ADR 0007: minimal abstraction, direct
command access, no lifecycle conflict with NestJS DI. `@nestjs/cache-manager` and
`cache-manager-redis-store` add adapter layers that make testing harder without adding value.

### Pattern 1 — Decision cache

- **Key:** `decision:{decision_id}`
- **Value:** JSON-serialised `DecisionEnvelope`
- **TTL:** 24 h
- **Written:** in `DecisionService.cacheDecision()`, called after every `forSelector()` and on
  DB fallback in `byDecisionId()`
- **Read:** `DecisionService.byDecisionId()` checks Redis before Postgres
- **Rationale:** `decision_id` is content-addressed (ADR 0006) — same snapshot always produces
  the same id, so caching by id is safe. 24 h covers the full day's activity window.

### Pattern 2 — Baseline cache

- **Key:** `baseline:{subject_ref}:{as_of}`
- **Value:** JSON-serialised `SignalSnapshot["baselines"]`
- **TTL:** 23 h (under the decision TTL to expire first, avoiding a decision that references a
  stale baseline)
- **Written:** `BaselineComputationService.computeFor()` after a Postgres read (not on
  cold-start Option A fallback, which is per-client and not derived from server history)
- **Read:** `computeFor()` checks Redis before Postgres
- **Invalidated:** `BaselineComputationService.invalidate()` is called in
  `IngestionController.ingest()` immediately after `snapshots.upsert()` so that the baseline
  computation that follows always reads the freshly written row
- **Rationale:** On the same day, multiple sources (e.g. Apple Watch + BLE strap) may ingest.
  The cache is invalidated on each upsert to ensure the rolling mean includes all available data.

### Pattern 3 — BullMQ decision queue (scaffolding)

- **Queue name:** `decisions`
- **Job data:** `{ decision_id: string }` (no biometrics in queue payloads)
- **Producer:** `IngestionController.ingest()` enqueues after `decisions.save()` —
  fire-and-forget; a queue failure does not fail the HTTP response
- **Consumer (stub):** logs `decision_id` only — placeholder for SCRUM-75 execution layer
  (exactly-once delivery, APNs/FCM, quiet hours, state machine)
- **Rationale:** ADR 0004 §option-2 names `EngineClient` as the seam. The queue sits downstream
  of the engine call, decoupling the decision from its delivery. BullMQ is chosen because it is
  built on ioredis, so no second Redis connection model is introduced.

## Health check

`RedisHealthIndicator.ping()` is added to `GET /health/ready` alongside the existing database and
engine checks. A Redis failure makes the service unavailable — Art.9 health data must not be
ingested if the hot path cannot operate correctly.

## Consequences

- `ioredis` and `bullmq` are added as production dependencies.
- `REDIS_URL` defaults to `redis://127.0.0.1:6379`; managed Redis in production is configured
  by the same variable.
- TODO(SCRUM-77): per-region Redis routing replaces the single `REDIS_URL` (same seam as
  `database.provider.ts`). UK and US subjects must route to region-pinned Redis instances.
- Cold-start (Option A) baselines are never cached — they are client-derived and do not
  represent computed server history.
- The BullMQ worker stub logs `decision_id` only. No biometric values enter the queue payload.

## Open questions

- **SCRUM-77** — per-region Redis: one instance per region or Redis Cluster? Deferred to that
  phase.
- **SCRUM-75** — execution layer: the worker stub becomes a real state machine when that phase
  lands. The queue name, job schema and retry policy are owned by that ticket.
