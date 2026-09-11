# ADR 0007 — Storage model and data residency

Date: 2026-09-11
Status: Proposed
Implements: SCRUM-72

## Context

SCRUM-72 adds the first persistence layer to Weyos. Two tables must exist before Phase 2 is
complete:

- `signal_snapshots` — Art.9 special-category health data: one row per (subject_ref, as_of).
  Ingested, validated and normalised at the API boundary; read back by the engine sidecar and
  the agent layer.
- `decisions` — the `DecisionEnvelope` produced by the engine, stored verbatim. Derived from
  health data and therefore in the same Art.9 retention class.

There is currently no database code in the repo. Everything in this ADR is net-new.

## Decisions

### 1. Driver: postgres.js (no ORM)

**postgres** (`npm: postgres ^3.4`) is the sole new production dependency.

Rationale for postgres.js over `pg + @types/pg`:
- TypeScript-first — types flow through without casting; no separate `@types` package.
- Tagged template literals make parameterised queries the path of least resistance and SQL
  injection safe by construction.
- Zero transitive dependencies in production.

Rationale for no ORM (TypeORM, Drizzle, Prisma):
- TimescaleDB DDL (`create_hypertable`, `add_retention_policy`) is invisible to every ORM's
  migration generator — raw SQL is required regardless.
- A type-safe query builder adds no value over tagged templates for a two-table schema with
  fixed queries.
- Avoids a second framework lifecycle competing with NestJS DI.

**Custom migration runner** (~50 lines, `migration.runner.ts`) replaces a third-party migration
tool. It maintains a `_migrations` table, applies pending `.sql` files in filename order, wraps
each in a transaction, and records the filename on success. Fail-closed: a failed migration
aborts startup. Two tables are insufficient to justify a migration framework dependency.

### 2. signal_snapshots schema deviation — snapshot_json column

In addition to the flat columns that mirror `signal-snapshot.schema.json` fields (for querying
and analytics), `signal_snapshots` includes a `snapshot_json JSONB NOT NULL` column that stores
the full original payload. This enables lossless round-trip retrieval (`latestForSubject`) without
marshalling every optional nested field individually. The flat columns are authoritative for
queries; `snapshot_json` is authoritative for retrieval.

### 3. decisions table deviation — non-unique index + application-layer idempotency

The spec says `decisions` should have `PRIMARY KEY (decision_id TEXT)`.

**Decision:** partition `decisions` on `created_at` (TIMESTAMPTZ), use a regular (non-unique)
index on `decision_id`, and enforce idempotency in the application layer.

**Why not a UNIQUE INDEX on `decision_id`?**
TimescaleDB rejects any UNIQUE constraint or index whose definition does not include the
partition column (`created_at`). `decision_id` is opaque (16 hex chars of SHA-256, content-addressed
per ADR 0006) and not time-based; a composite `(decision_id, created_at)` unique index would be
semantically wrong (the same decision could theoretically appear in two time chunks). A regular
index on `decision_id` is used instead. This was discovered during integration startup, not from
prior knowledge of TimescaleDB behaviour.

**Why not `ON CONFLICT (decision_id) DO NOTHING`?**
`ON CONFLICT` requires a unique constraint on the conflict target column. Since there is no unique
constraint on `decision_id`, this form is rejected by Postgres at runtime. Idempotency is enforced
in `DecisionRepository.save()` using a check-then-insert pattern: SELECT for the `decision_id`
first; INSERT only if not found.

Trade-off: the SELECT+INSERT is not atomic under concurrent writes. Two simultaneous ingests of the
same `decision_id` could both pass the SELECT check and attempt INSERT. In practice, `decision_id`
is content-addressed per input snapshot; two concurrent requests for the same subject+date would
produce the same id, but the engine is stateless and the race window is the SELECT→INSERT round
trip inside a single request. A duplicate row is the worst case; it does not corrupt any state and
is survivable. If this proves problematic under load, adding `(decision_id, created_at)` as a
composite unique constraint is the migration path.

Partitioning on `created_at` gives uniform `add_retention_policy` application alongside
`signal_snapshots`. `decision_id` is content-addressed (ADR 0006) so a retried ingest for the
same payload generates the same id and is a safe no-op at the application layer.

### 4. JSONB serialization — pass objects directly, never pre-stringify

postgres.js treats a JavaScript string as a JSON scalar when the SQL contains a `::jsonb` cast.
Passing `JSON.stringify(obj)::jsonb` therefore stores a JSONB string (type = 'string') rather
than a JSONB object — equivalent to `'"the string content"'::jsonb` in Postgres.

**Decision:** pass the domain object directly in the template literal with `::jsonb`. postgres.js
serialises it once, correctly, as a JSONB object. The `as any` cast is required because postgres.js's
TypeScript parameter type does not accommodate domain interface types with optional fields and no
index signature.

```ts
// Correct — object serialised once as JSONB object:
await this.sql`INSERT INTO t (col) VALUES (${obj as any}::jsonb)`;

// Wrong — string double-serialised to JSONB string:
await this.sql`INSERT INTO t (col) VALUES (${JSON.stringify(obj)}::jsonb)`;
```

This applies to `signal_snapshots.snapshot_json`, `signal_snapshots.planned_meals`, and
`decisions.envelope`. Any future JSONB column must follow the same pattern.

### 5. Retention — 730 days (2 years)

Applied via `add_retention_policy` on both hypertables.

**Binding constraint — UK GDPR Art.5(1)(e) + Art.9.**
`signal_snapshots` is Art.9 special-category health data. The ICO's "no longer than necessary"
principle requires a documented purpose for every retention day.

The product purpose is: *"provide personalised daily guidance using individual trend baselines."*

- The schema's `baseline_window_days` is at most 90 days.
- Two years provides approximately 8 baseline windows (730 / 90), capturing two full seasonal
  cycles (52 weeks × 2 = 104 weeks). Two seasonal cycles are the minimum needed to establish
  stable individual baselines and detect seasonal variation — the core claim of the product.
- Three years has no additional justified purpose at MVP and increases ICO challenge risk.
- One year is insufficient: a single seasonal cycle cannot be validated.

**Confirming constraint — US (CCPA/CPRA, FTC Act Section 5).**
Both require retention "no longer than reasonably necessary for the disclosed purpose." Neither
imposes a shorter period for this data category. The UK constraint is binding.

**Review:** Revisit this policy with counsel at first production launch and every two years
thereafter.

**TODO:** Pre-production counsel sign-off required before any real user's Art.9 data enters the
store. Do not activate retention in production without it.

**TODO(SCRUM-77):** Per-region retention may diverge once separate UK and US database instances
exist.

### 6. Data residency — current state and deferred work

Currently a single `DATABASE_URL` environment variable points to one Postgres instance. This is
the only safe configuration for development and testing; it is **not** production-safe for
real health data.

**Region is an account attribute, not a signal attribute.** `signal_snapshots` has no `region`
column. A subject's data residency is determined by their account (UK or US), not by the
snapshot itself.

**Per-region routing is SCRUM-77.** When SCRUM-77 lands, `DatabaseModule` must resolve the pool
from the authenticated account's region at request time. A UK subject's snapshots must never
land in a US-hosted database instance, and vice versa. `database.provider.ts` is the seam:
the single `createPool()` factory becomes a region-keyed map of pools.

**The system is not production-safe for real health data until SCRUM-77 is complete.**

### 7. Logging discipline

Per CLAUDE.md: no raw biometrics in logs or error messages.

- `subject_ref` (pseudonymous, not a biometric) — safe to log (first 8 chars for debuggability).
- `decision_id` — safe to log (ADR 0006: "the snapshot is not [loggable], the id is").
- Column values for any biometric field (`hrv_ms`, `rhr_bpm`, `sleep_score`, etc.) — never
  logged, never included in error messages.

Repository methods log: method outcome, `subject_ref` prefix, `as_of` date, durations.

## Open questions (must not be resolved in code)

1. **Same-day multi-source snapshot conflict.** `upsert` on `(subject_ref, as_of)` overwrites.
   If a user submits two ingest requests on the same calendar day from different devices
   (e.g. Apple Watch in the morning, Oura ring in the evening), the second write silently wins.
   Is this the correct product behaviour? Needs a data policy decision before Phase 3 connects
   real wearables. (§9 of the build plan does not cover this explicitly.)

2. **Retention vs baseline cold-start interaction.** If retention deletes snapshots older than
   730 days and a user has 731+ days of data, their oldest baseline day is removed. The engine's
   cold-start behaviour when `days_of_history` drops is under-designed (CLAUDE.md open question).
   Both must be answered before retention is activated in production.

3. **Subject-to-region mapping.** Which table holds the authoritative account-to-region
   mapping? The API must resolve this before the first write to route to the correct pool.
   Foundational question for SCRUM-77.

4. **`cycle_day > 28` storage.** The upsert stores whatever passes validation. The engine's
   behaviour on `cycle_day > 28` is undefined (CLAUDE.md). Storing it defers the problem to
   query time; it needs a product decision.

## Consequences

**What changes:**
- `IngestionController`: `upsert snapshot → call engine → persist decision → return 202 + decision_id`. Response shape changes from `{ accepted, decision }` to `{ accepted, decision_id }`.
- `PersonaSource.resolve()`: async; live path (demo disabled + real subjectRef) reads from `SignalSnapshotRepository`.
- `DecisionService.byDecisionId()`: async; falls through to `DecisionRepository` on cache miss.
- `DecisionService.snapshotFor()`: async; propagated to `DecisionController`.
- `HealthController.ready()`: checks DB pool alongside the engine sidecar.

**What is unchanged:**
- Engine purity — store writes happen in the API layer, never in the engine service.
- Schema contract — `signal-snapshot.schema.json` is not modified.
- Demo fixture path — `PersonaSource` retains the fixture path for `WEYOS_DEMO_FIXTURES=true`.
- `decision_id` derivation — computed once in Python (ADR 0006), treated as opaque here.
