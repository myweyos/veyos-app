# ADR 0007 — Schema versioning and TypeScript type generation

Date: 2026-09-10
Status: Accepted
Jira: SCRUM-24

## Context

`packages/shared-schema` is the contract between the mobile app, the API, and the
engine. Until this ADR, its TypeScript projection (`src/index.ts`) was hand-written,
with a comment saying it should be replaced once generation was in place. That file
had drifted in naming and precision from the actual JSON Schemas — for example,
`Decision.food.meals[].items` was typed as `FoodItem[]` (matching the engine's
behaviour) while `decision.schema.json` said only `{ type: "object" }`, leaving
the schema less precise than the implementation.

There was also no automated guard against breaking schema changes landing without an
explicit version bump or ADR, which is required by CLAUDE.md non-negotiable #4.

## Decision

**1. TypeScript types are generated, not hand-written.**

A Node.js script (`scripts/generate.js`) uses `json-schema-to-typescript` v15 to
compile the three `.schema.json` files in `schemas/` into `src/generated.ts`.
`src/index.ts` re-exports from `generated.ts` and adds only the runtime constant
`SCHEMA_VERSION`.

The generator runs with a custom local-file resolver so `decision-envelope.schema.json`'s
`$ref: "https://schema.weyos.app/v1/decision.json"` resolves to the local
`decision.schema.json` without network access. This keeps generation deterministic and
offline-safe.

**2. Schema precision was improved alongside generation.**

`decision.schema.json` previously typed `food.meals[].items` and `food.meals[].removed`
as bare `{ type: "object" }`. Both now reference typed `$defs`:

- `foodItem` — `{ name: string; tags: string[] }` (matches the engine's output)
- `removedItem` — `{ name: string; rule_id: string; reason: string }` (carries the
  audit trail per the engine's trace contract)

This tightening is technically a breaking schema change (previously any object was
valid; now only conforming objects are) and is the reason `package.json` version was
bumped from `1.0.0` to `1.1.0`.

**3. CI enforces sync and version discipline.**

Two new steps in the `contract` job:

- **Generated TS types are in sync with schemas** — runs `npm run generate` and
  checks `git diff --exit-code` on `src/generated.ts`. A PR where the schemas were
  edited without regenerating the types will fail here.

- **Breaking schema changes require a version bump** — `scripts/check-breaking.js`
  compares all three schemas against `origin/main` and detects: removed properties,
  properties added to `required`, changed `const` values, and removed `enum` values.
  If any are found and `package.json` version has not changed, CI fails.

## Consequences

- Editing a JSON Schema without running `npm run generate` fails CI.
- A breaking schema change without a version bump fails CI.
- `schema_version: const: 1` inside the JSON Schemas is the **payload version**
  (runtime field in every document). The `"version"` in `package.json` is the
  **package semver**. They are independent and change at different rates. See
  `docs/decision-object-contract.md` for the distinction.
- The hand-written types `FiredRule`, `TraceEntry`, `DecisionPresentation`,
  `WarningKind`, and the union type aliases (`Dosha`, `Intensity`, etc.) are no
  longer exported from the package. Grep of the codebase confirmed no consumer
  imported them. If a future consumer needs one, it can be extracted with TypeScript's
  indexed access: e.g. `Decision["fired_rules"][number]`.

## Open question (not resolved here)

The `schema_version: const: 1` field appears in four places (both schemas,
`src/index.ts` via `SCHEMA_VERSION`, `models.py`, every persona fixture). Bumping it
is a product-level decision, not a code decision, and is tracked separately. The
`package.json` semver bump in this PR is not a signal to bump `schema_version`.
