# Contributing

## Setup

```bash
make setup
make test
```

If `make engine-test` is not green on a fresh clone, stop and fix that before anything else.

## Branching

- `main` is protected. PR only, one approving review, CI green.
- Branch names: `feat/VEY-123-slug`, `fix/VEY-123-slug`, `chore/slug`.
- Conventional commits: `feat(engine): add cardiovascular load rule`.

## The three things that get a PR rejected

1. **Rule logic outside the engine.** A threshold comparison in a component or a controller
   is a rule that cannot be tested, versioned or backtested. Put it in `config/rules/`.
2. **A rulebook change without a fixture.** Non-negotiable.
3. **Silently resolving an open spec question.** The list is in `CLAUDE.md`. If your change
   needs an answer, open a `[SPEC]` issue and get one.

## Working with the engine

```bash
make decision PERSONA=alex STATE=crash        # human-readable trace
make decision-validated                        # elemental layer off
cd services/engine && pytest -k "F9 or F11"    # the two load-bearing fixtures
```

Adding a rule:

1. Add it to `config/rules/rules.v1.yaml` with a **unique priority** (duplicates are fatal —
   they make arbitration order-dependent on YAML ordering).
2. Only block/mandate tags that exist in `packages/shared-schema/schemas/food-tags.json`.
   Adding a tag is a contract change.
3. Add a golden fixture. If the rule is proposed but not approved, ship it `enabled: false`
   with an `xfail` fixture so the intended behaviour is documented and the day it is
   approved is a one-line change.

## Changing the contract

`packages/shared-schema/schemas/*.json` is the source of truth. Changing it means:

1. An ADR in `docs/adr/` — what changed, why, what breaks.
2. Regenerate TS types (`npm run generate -w @veyos/shared-schema`).
3. Engine contract tests pass (`services/engine/tests/test_contract.py`).
4. Bump `schema_version` if the change is not backwards compatible, and say how old clients
   are handled. Phones in the field do not update on your schedule.

## Data rules

- No real subject data in this repo, in fixtures, in CI, or in local docker. Ever.
- No biometric values in logs, error payloads, exception messages or trace strings.
  Rule ids, deltas and booleans only.
- `subject_ref` is pseudonymous. It is never an email, name or device id.

## Code review

Review the trace, not just the diff. For any engine change, paste the before/after output of
`make decision` for at least one affected persona into the PR. Reviewing arbitration by
reading Python is much harder than reading what it decided.
