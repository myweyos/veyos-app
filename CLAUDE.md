# CLAUDE.md — working agreements for AI-assisted development in this repo

Read this before making changes. It applies to Claude Code, to any other agent, and
honestly to humans too.

## Current plan — read this before picking up any ticket

**As of 2026-09-10 the plan is `docs/build-plan-v2-direct-to-product.md`. It supersedes
`docs/build-plan-stage1-wrapper.md`, which is retained for history only.**

Two things changed:

1. **There is no investor demo stage.** We build the full MVP as specified — all five layers, the
   complete surface set, UK and US — on live HealthKit / Health Connect / BLE data against a real
   backend. Fixtures are tests and a dev harness, never a runtime data source.
2. **The conversational layer is full agent orchestration**, not a chat wrapper: an agent with a
   tool surface that can read engine state *and take bounded actions on the user's plan*, under the
   authority model in §6 of the plan.

## What this project is

Weyos ingests biometric signals (HRV, RHR, sleep stages, wrist temperature, steps, plus
optional lab values), normalises them into one canonical schema, and runs them through a
deterministic 5-layer rulebook that produces exactly one daily intervention. There is no ML
in the MVP. Every output must be explainable as "rule X fired because signal Y crossed
threshold Z".

## Non-negotiables

1. **The engine is pure.** `services/engine` does no network, no DB, no clock reads, no
   randomness. Inject time and config. If you find yourself importing `requests` or
   `datetime.now()` in engine code, you are in the wrong layer.
2. **Rules live in config, not code.** `config/rules/rules.v1.yaml` holds thresholds,
   priorities, blocks and mandates. Code interprets config. Adding a rule means editing
   YAML + adding a fixture, not writing an `if`.
3. **Every rule change ships with a fixture.** No exceptions. Golden fixtures are the
   regression net for a system whose output is advice given to a human body.
4. **The contract is versioned.** Breaking `packages/shared-schema` requires an ADR.
5. **No raw biometrics in logs or error messages.** Rule IDs, deltas and booleans only.
6. **Layer separation is a product requirement, not a preference.** With
   `features.elemental_layer = false` the engine must produce a decision derived solely
   from L1/L2/L5. Fixture F11 proves this. If F11 goes red, stop.

7. **The engine is the sole author of every health judgement.** The agent orchestrates around it.
   It never decides, never overrides, never re-weights, and never narrates a Layer 1 decision — it
   hands off to the structured takeover. Everything the agent says about the user's body arrives as
   an already-decided object through the context builder. No tool reaches a signal store directly.
8. **Agent actions are proposals, not writes.** Every mutating tool call goes through the effect
   layer: deterministic precondition check, confirmation policy, turn-scoped idempotency key,
   append-only audit entry. An action that contradicts today's engine decision is refused, not
   warned. The agent never changes consent state, never edits a signal, a baseline, a rule or a
   stored trace, and never confirms on the user's behalf.
9. **No demo mode, in any build.** No fixture-backed screens, no scenario switcher outside a
   dev-only harness, no simulated intervention a user could reach. If a code path exists so that
   something *looks* like it works, delete it.

## Conventions

- Python: 3.11+, `ruff` + `mypy --strict` on `services/engine`. Type everything.
- TypeScript: strict mode on. No `any` in `packages/` or `services/api/src`.
- Commits: conventional commits (`feat(engine): ...`). Reference the Jira key where one exists.
- Branches: `feat/VEY-123-short-slug`. Trunk is `main`, protected, PR-only.
- Tests colocate with the thing they test. Golden fixtures live in
  `services/engine/tests/fixtures/` as data, not code.

## Known open spec questions — do NOT silently resolve these in code

These came out of hand-tracing the personas against the rulebook. If your change touches
one, raise it rather than picking an answer:

- **No rule fires on elevated RHR alone.** Rule 1.3 requires temp ≥ +0.5 °C *and* elevated
  RHR. James's crash state therefore fires only L3 → the app would say "in balance today"
  while his RHR sits 26% above baseline. Candidate rule 1.4 (Cardiovascular Load) is
  proposed but unapproved. Tracked as `xfail` in the fixture suite.
- **Pollen / air quality is not a signal in the model at all.** Candidate 4.4.
- **Rule 1.2 ambiguity:** written about deep/REM *stage* percentages, but the persona data
  supplies a composite sleep score. Different measurements, different platform availability.
- **Percentage vs z-score:** the rulebook uses % below baseline; the patent recites
  `(current − trailing MA) ÷ historical SD`. Config supports both forms; the default is
  decided on backtest evidence, not vibes.
- **Cycle day > 28 is undefined.** Cold start (4–8 weeks with no baseline) is under-designed.
- **Ginger-for-a-Pitta:** L1's immunity basket mandates warming ginger while L3 Pitta blocks
  hot/spicy. L1 correctly wins, but it reads badly in the UI on a 30 °C day. Likely needs
  per-item substitution in L1 effects.

- **Dosha vs baseline phenotype.** The Baseline Phenotype epic *replaces* the dosha model, while
  rules 3.1–3.3 fire on dosha membership today and the personas, fixtures, L3 trace rows and food
  chain all assume it. Largest source of rework in the backlog. Do not start either side of it
  without an answer.

The full decision list, with owners and what each one blocks, is §9 of
`docs/build-plan-v2-direct-to-product.md`. That list is authoritative; this one is the short form.

## Do not port from the Base44 prototype

The prototype drifted from spec (a "warming indoor Vinyasa" offered as a parasympathetic
substitute; a meal labelled cooling that names a warming stew). The prototype is a demo of
the logic, not a source of truth. `config/rules/rules.v1.yaml` and `docs/engine.md` are.

## When you are unsure

Prefer raising a question in the PR over guessing. This codebase produces health-adjacent
advice; a plausible-looking wrong answer is worse than a blocked PR.
