# ADR 0001 — Single monorepo

Date: 2026-08-18
Status: Accepted

## Context

Two builders, three surfaces (Expo client, Node API, Python engine), one contract that all
three must agree on. Split repos give clean ownership boundaries; a monorepo gives atomic
cross-boundary changes.

## Decision

One repo. Service boundaries stay strict: no cross-imports except through
`packages/shared-schema`. Extraction stays cheap if the team ever grows enough to need it.

## Consequences

- A contract change is one PR and one CI run, not a coordinated three-repo dance.
- CI must be path-aware as the repo grows, or every PR runs every suite.
- Nothing may import across service boundaries. Reviewers enforce this.
