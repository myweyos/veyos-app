# ADR 0003 — The rulebook is versioned config, not code

Date: 2026-08-18
Status: Accepted

## Context

16 rules across 5 layers, with thresholds that will move as evidence arrives. Encoding them
as Python conditionals means every threshold change is a code review, a deploy, and an
untestable claim about what changed.

## Decision

`config/rules/rules.vN.yaml` holds thresholds, priorities, blocks, mandates and effects. The
engine interprets it. Rulebook loading validates invariants at startup and fails fatally:
unique ids, unique priorities, known layers, and food tags drawn only from the controlled
vocabulary in `packages/shared-schema/schemas/food-tags.json`.

Proposed-but-unapproved rules ship `enabled: false` with an `xfail` golden fixture, so the
intended behaviour is documented and approval is a one-line change.

## Consequences

- Changing a threshold is: edit YAML, run the backtest, update/add a fixture. No redeploy of
  logic, no new code path.
- Duplicate priorities are fatal rather than tolerated: arbitration must never depend on the
  order lines happen to appear in a YAML file.
- The engine must never contain a rule-shaped `if`. CI has a crude guard; reviewers are the
  real enforcement.
