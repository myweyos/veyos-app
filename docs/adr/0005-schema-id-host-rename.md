# ADR 0005 — Schema `$id` host moves to schema.weyos.app

Date: 2026-08-25
Status: Accepted

## Context

The product is spelled **Weyos** (confirmed 21 Aug). The repo said Veyos throughout, and the rename
pass reaches the two JSON Schema `$id` values:

```
https://schema.veyos.app/v1/signal-snapshot.json
https://schema.veyos.app/v1/decision.json
```

`$id` is the only field in either file that does not describe data. It is the document's *identity* in
the JSON Schema ecosystem — the thing a `$ref` from another schema, a registry publication, a caching
client, or a DPIA citing "the contract" would key on.

CLAUDE.md rule 4 says "**Breaking** `packages/shared-schema` requires an ADR". CONTRIBUTING.md is
stricter and unqualified: "Changing it means: 1. An ADR in `docs/adr/`". The PR template's checkbox
reads "Schema changed — ADR added", also without a breaking qualifier. One lenient reading, two strict
ones. In a repo whose closing line is "a plausible-looking wrong answer is worse than a blocked PR",
you take the strict reading — hence this document, for a change that is not technically breaking.

## Decision

The host moves to `schema.weyos.app`. **Nothing else changes.**

| Before | After |
|---|---|
| `https://schema.veyos.app/v1/signal-snapshot.json` | `https://schema.weyos.app/v1/signal-snapshot.json` |
| `https://schema.veyos.app/v1/decision.json` | `https://schema.weyos.app/v1/decision.json` |

- The `/v1/` path segment is unchanged.
- **`schema_version` stays `1`.** It is `const: 1` in both schemas, `SCHEMA_VERSION` in
  `packages/shared-schema/src/index.ts`, `schema_version: int = 1` in `models.py`, and is carried by
  every persona fixture. Bumping it would break every fixture and both contract tests for a change
  that alters no field. Do not "helpfully" bump it later.
- No field, type, enum, `required` entry or `additionalProperties` setting changes.

The document's identity changes. Its shape does not.

## Alternatives considered

**Keep `schema.veyos.app` as the durable v1 identity, rename only at v2.** Defensible — `$id` is
supposed to be stable, and a v1 payload archived today legitimately cites the old URI. Rejected because
the host was never served, nothing resolves it, no client exists, and carrying a dead brand in the
contract's identity for the life of v1 costs more in confusion than the one-line mapping below costs in
archaeology.

**Treat it as a chore and skip the ADR.** Rejected on the reading above. If schema changes get ADRs,
the schema's identity is the last thing you would exempt.

## Consequences

**Non-breaking for every current consumer**, for four specific reasons:

1. `services/api/src/ingestion/snapshot.validator.ts` compiles the schema from a **relative filesystem
   path** off `__dirname`, not from the `$id`.
2. Every `$ref` in both schemas is internal (`#/$defs/labValue`). No cross-document reference resolves
   a host.
3. CI's `ajv-cli compile` runs per file and never dereferences the `$id`.
4. `services/engine/tests/test_contract.py` reads the files directly with `jsonschema`.

Proven, not assumed: `python -m backtest run --snapshots <dir> --validate` compiles
`signal-snapshot.schema.json` through `jsonschema` and validates a real corpus against it after the
change.

**For anyone reading an archived payload:** a payload quoting `https://schema.veyos.app/v1/decision.json`
refers to the same document as `https://schema.weyos.app/v1/decision.json`. Same shape, same
`schema_version`, same `/v1`. This paragraph is the greppable record of that.

**If these are ever published at a resolvable URL**, `schema.weyos.app` must serve them. There is no
plan to serve `schema.veyos.app` or to redirect it; the domain was never live.

**`/v1/` is decoupled from `schema_version`.** Both are 1 and both stay 1. They are not the same number
and will not necessarily move together.

**CONTRIBUTING step 2 ("Regenerate TS types") is a no-op here** — `packages/shared-schema/src/index.ts`
is hand-written pending VEY-SCHEMA-GEN, and an `$id` change produces no TypeScript delta in any case.
Stated explicitly rather than skipped silently.
