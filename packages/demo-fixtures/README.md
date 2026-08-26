# @weyos/demo-fixtures

Scripted personas for the Stage 1 investor demo. Three subjects, one scripted week each, run
through the **real** arbitration engine on fixture data.

```bash
make demo                      # walk all three scenarios
make demo PERSONA=james        # just James
make demo-regenerate           # rebuild expected/ after a scenario or rulebook change
```

## What this is not

- **Not a rulebook.** Nothing here changes what fires. Every day is decided by
  `config/rules/rules.v1.yaml` through the real `decide()`.
- **Not the contract.** `packages/shared-schema` is the contract. Profiles and scenarios are
  demo scaffolding and deliberately never reach a snapshot.
- **Not for production.** A fixture that survives into a production build is a fake
  intervention. Phase 9 puts the demo controls behind a build flag with a test that fails if
  any of them is reachable in a production build.

## Layout

| Path | What |
|---|---|
| `personas.json` | The three subjects, in canonical SignalSnapshot form. **The** copy — `golden.yaml` references these. |
| `profiles/*.json` | Demo metadata: region, display name, the activity the engine overrides, and a declared reachability statement per app state. |
| `scenarios/*.json` | The scripted days. |
| `app-states.json` | The 3→6 app-state mapping, as reviewable data, with its open questions. |
| `expected/` | Committed golden output. The drift guard between the Python and TypeScript drivers. |
| `src/` | TypeScript loader, clock and app-state derivation. |

The Python side lives at `services/engine/demo_driver/` — a top-level package beside
`backtest`, so the engine's own package list and its purity guarantees stay untouched.

## Why region is not in the snapshot

`signal-snapshot.schema.json` sets `additionalProperties: false` at every level, so adding
`region` would be a contract change requiring an ADR. It would also be a modelling error:
region is an attribute of the subject *account* — data residency, consent stack, units,
retailer set — not of a per-day signal payload. It lives in the profile, and a test asserts it
agrees with the snapshot's `timezone`.

## The day-clock

A pure function from `(scenario, dayIndex)` to the derived per-day fields — `as_of`,
`cycle_day`, `days_of_history` — so scenarios do not restate them. It reads no wall clock:
`start_date` comes from the scenario file.

Snapshots are built in three layers, in order:

```
persona base (calm, optionally deep-merged with its crash delta)
  → clock-derived fields
    → the day's explicit `patch`
```

An explicit patch always wins, which is what lets a scenario say "on this day, pretend it is
cycle day 10" without fighting the arithmetic.

**The clock refuses to run past cycle day 28.** Layer 2 covers days 1–28 and nothing beyond;
day 29+ is undefined in the rulebook and on CLAUDE.md's do-not-resolve list. Wrapping to day 1
would answer that question inside a helper function, so the clock throws instead.

## The app-state mapping is data, and it is not signed off

The engine emits three states (`calm | intervention | insufficient_baseline`). The product
design needs six. That mapping decides what a user is told, and several of its edges are
genuinely undecided — so it lives in `app-states.json` as an ordered list with an
`open_questions` block, and both drivers walk it rather than encoding it.

`status` is **PROPOSED**. Six questions need a ruling, and three of them are load-bearing:

- **`partial` is narrowed to Layer 1.** The engine maps an absent signal to UNKNOWN
  identically to one that failed to sync, so a subject with no cycle has 2.1–2.4 unevaluable
  *every day* and a subject with no labs has 5.1–5.3 unevaluable *every day*. Counting those
  would make every non-cycling subject permanently "partial" and delete fixtures F2 and F5
  from the demo. The narrowing makes the demo correct; it does not fix the modelling gap.
- **The priority order is a proposal.** Alex's crash day is simultaneously `partial` and
  `intervention`. Something has to win, and the user sees which.
- **`in balance` is structurally unreachable for a cycle-tracking subject.** Layer 2 covers
  days 1–28 with no gaps and `calm` means "only always-on Layer 3 fired". Sarah reaches it
  only with cycle tracking off.

## Two defects are visible in the demo on purpose

**James, day 1 — THE JAMES GAP.** RHR 26% above baseline, steps collapsed, and the app says
"in balance today". Rule 1.3 is dual-gated on temperature *and* RHR; with no temperature rise
it evaluates cleanly to FALSE, so there are no warnings and no unevaluable rows. Nothing in
the Decision distinguishes that day from his genuinely calm day 0. Day 3 is the same persona
with HRV patched down — same collapsed steps, same elevated RHR, but now a rule can *see* it.
That contrast is the argument for candidate rule 1.4.

**Alex, day 1 — ginger for a Pitta.** Rule 1.3's immunity basket adds ginger tea, which
carries the `hot` tag his Pitta profile blocks. L1 outranks L3, the ginger stays, and the
engine emits a warning rather than silently substituting. Do not filter that warning to make
the screen look clean.

## expected/

Committed golden output, regenerated with `make demo-regenerate`. It pins the drift-prone
surface — the snapshot two independent drivers must build identically, and the app state
derived from a decision — and deliberately does **not** embed the whole Decision, because
`golden.yaml` is already the engine's regression net and restating it would give two files
that must agree about the same thing.

If `test_committed_expected_output_is_current` fails, regenerate and **read the diff before
committing it**. A change there means a scenario, the mapping, or the engine moved.
