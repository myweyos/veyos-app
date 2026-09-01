# Build status against Weyos_MVP_Jira_Import_v3

Assessed 2026-09-01 against `development` @ `caf1d9a`. Every status below is evidence-backed;
where a story is marked **Partial** the missing acceptance criteria are named, because a
half-done story imported as Done is worse than one imported as To Do.

**Legend** — ✅ Done · 🟡 Partial · ⬜ Not started · 🚫 Blocked (decision pending)

**Totals:** 8 Done · 17 Partial · 62 Not started · 14 Blocked.

---

## Foundations & Platform

| Status | Story | Evidence / what's missing |
|---|---|---|
| 🟡 | Push monorepo to GitHub and protect main | Pushed to `myweyos/veyos-app`, on `development`. **main is NOT protected** — no branch protection, no required checks configured. CODEOWNERS exists but its `@veyos/*` teams don't, so it silently matches nothing. |
| 🟡 | CI pipeline | ruff + `mypy --strict` + pytest run on every PR ✅. Golden fixtures gate merges ✅. **No EAS build check.** Also repaired three pre-existing failures in the Contract job that had been red since bootstrap. |
| ✅ | ADR 0004 — how Node invokes Python | Accepted. FastAPI sidecar at `services/engine-http/`, alternatives and failure modes documented, engine purity asserted on the AST in CI. |
| ⬜ | Apple Developer / Play Console enrolment | Not started. **Calendar risk, blocks all of Native Signals.** Flagged repeatedly. |
| ⬜ | Shared schema versioning and TS projection | `src/index.ts` is **hand-written**; `generated.ts` does not exist and `npm run generate` has never run. AC explicitly requires generated, not hand-written. |
| ⬜ | Environments, secrets, per-region deploy | Not started. |

## Design System & App Shell

| Status | Story | Evidence / what's missing |
|---|---|---|
| 🟡 | Design tokens and theming | Brand kit v3 transcribed from the pack into `tokens.ts` — five pillars, type scale, radii, Fire-only buttons ✅. **Contrast not verified** (3:1 on cream and dark), 4pt grid not audited, and there is **no dark palette** — the pack defines none. |
| 🟡 | VerdictBlock, SignalTile, PillarMark | VerdictBlock ✅. SignalTile ✅ including "Not available" with a reason, never a zero. **PillarMark not built** — needs `react-native-svg`. |
| 🟡 | TraceRow, CollisionWarning, LayerChip | TraceRow ✅ (applied / suppressed / unevaluable). CollisionWarning ✅ as `WarnBox`. **LayerChip not built.** See the trace-schema gap below — "not-applied" is not actually representable. |
| 🟡 | PlanRow, MealCard, BasketItem | PlanRow ✅ with the load-bearing strikethrough. MealCard partial (`RowLink`). **BasketItem not built.** |
| 🟡 | Buttons, SegmentedToggle, ConsentToggle | Buttons ✅, Fire-only enforced. **SegmentedToggle and ConsentToggle not built** — ConsentToggle's consequence-line requirement is untested. |
| ⬜ | BreathPacer and Timer | Not started. |
| ⬜ | TimelineRow and TrendChart | Not started. |
| 🟡 | Disclaimer, EmptyState, PermissionPrompt, Sheet, CalibrationMeter | Disclaimer ✅. CalibrationMeter partial (progress bar in B1). **EmptyState, PermissionPrompt, Sheet not built.** |
| ⬜ | Component snapshot tests | Not started. No light/dark snapshots. |
| ⬜ | Navigation — 4-tab bar + takeover modal | Not started. The dev harness is a scenario switcher, **not** the tab bar. |
| 🟡 | App state and decision-object client model | Six states modelled in `app-states.json` ✅. UNKNOWN is first-class end to end ✅. **The mapping is PROPOSED, not signed off** — six open questions. `active_layers[]` partially served as `presentation.fired_layers`. |
| ⬜ | Dynamic Type XXL, reduced motion, a11y | Not started, not verified. Needs a device. |
| ⬜ | Permission, offline and stale-data states | Not started. |

## Screens & Surfaces

| Status | Story | Evidence / what's missing |
|---|---|---|
| ⬜ | A1–A5, A6, A7, A8/H6, A9, A10, A11 | None of first run is built. |
| 🟡 | B1–B7 — Today states + signal detail | B1–B6 ported from the pack ✅, signal tiles always visible (the F5 mitigation) ✅. **B7 not built.** Sleep tile shows the reading and the usual value, **not** deep+REM as a percentage of baseline as the AC specifies. |
| ⬜ | B8 — environment driving | My invented version was deleted once the real pack arrived. **Not ported.** The pack has it verbatim; ~10h. |
| 🟡 | C1 and C2 | C2 ✅ — fixed sequence, strikethrough, "Not for me" at a constant distance, no red. **C1 push notification not built.** |
| 🟡 | C3 and G3 — decision trace | C3 ✅ layer-ordered, plain English, shows unevaluable, renders collisions, technical block collapsed. **Does not show a decision ID** (the sidecar now mints one; the client doesn't consume it). **G3 not built.** |
| ⬜ | C4/C5, D1–D4, E1–E4, F1/F2, G1, H1–H5, H7/H8 | Not started. |
| ⬜ | H9 — elemental and environmental layers | My invented version deleted. **Not ported** from the pack. |

## Native Signals & Ingestion

⬜ **All six stories not started.** No sensor dependency is installed — deliberately, per the
`$comment` in `apps/mobile/package.json`. Blocked on Apple/Play enrolment and a physical device.

## Backend & Data Platform

| Status | Story | Evidence / what's missing |
|---|---|---|
| 🟡 | Ingestion API with schema validation | Validation at the boundary ✅ — ajv against the published schema, rejects with a path-and-rule error that never echoes the value. **Nothing is stored**, so "before storage" is untested. |
| ⬜ | Canonical normalisation | Not started. |
| ⬜ | Time-series store / Redis / real-time channel / auth / multi-region | Not started. **There is no database code in the repo at all** — no driver, no ORM, no connection string. |
| 🟡 | Baseline service — percent vs z-score | Both modes implemented ✅ and a backtest harness exists ✅. **But the backtest proved the choice cannot currently be made:** no rule condition defines `value_z`, so z-score silently falls back to percent. No ADR recorded. |

## Arbitration Engine & Rulebook

| Status | Story | Evidence / what's missing |
|---|---|---|
| ✅ | Rulebook loader hardening and versioning | Fatal on duplicate ids, duplicate priorities, unknown layers, unknown food tags. Rulebook version travels with every decision. |
| ✅ | Three-valued evaluation and precedence | TRUE/FALSE/UNKNOWN preserved end to end; a missing signal is unevaluable, not false. Precedence covered by fixtures. |
| ✅ | Food resolution chain and collision warnings | Strict reverse precedence L4→L3→L2→L5→L1. F9 and F10 both pass. |
| 🟡 | Decision trace object and schema | Applied, suppressed and unevaluable are representable ✅; trace is in the published schema ✅. **"Not-applied" is NOT representable** — a rule evaluating FALSE produces no trace row at all (`engine.py:61-65`), so absence is inferred rather than recorded. The AC asks for all four. |
| 🚫 | Rule 1.4 — elevated RHR alone | Correctly not built. See the James note below. |
| 🚫 | Rule 4.4 — pollen / air quality | Correctly not built; `enabled: false`, reported as disabled with null rates. |
| 🟡 | Layer 2 — cycle logic | Exactly one rule fires per cycle day ✅; menstrual overrides follicular via priority 29 ✅. **The "in balance is unreachable with cycle data" question is raised, not resolved** — and the AC says resolve before shipping. |
| ✅ | Layer 5 — lab overrides | Fires only present-and-abnormal, outranks cycle/constitution/environment, F9 passes. |
| 🟡 | Golden fixture expansion and backtest harness | Harness ✅ — per-rule fire rates, co-firing, boundary-straddling grid, CI smoke run. **Fixtures do not cover every precedence pair**, and the backtest runs on synthetic sweeps, not recorded signal history. |
| 🟡 | Engine invocation from the API | Sidecar ✅, engine stays pure ✅. **Decision is not persisted** before dispatch — no storage exists. |

## Baseline Phenotype & Onboarding

⬜ **All ten stories not started.** Worth flagging loudly: this epic **replaces the dosha model**,
and rules 3.1–3.3 currently fire on dosha membership. Everything built so far — personas, golden
fixtures, the L3 trace rows, the food chain — assumes dosha. This is the largest single source of
rework in the backlog and it collides with work already done.

## Elemental & Environmental Layers

🚫 **All six stories blocked.** Correctly not started — decision pending. Note H9 currently states
the product does not use a birth chart, star sign or numerology; if this epic ships that copy
changes in the same release.

## Execution & Delivery

⬜ **All six stories not started.**

## Trust, Privacy & Compliance

⬜ **All nine stories not started.** No consent surfaces, no export, no delete, no dependency
allowlist. The engine and API do already honour "no raw biometrics in logs or error messages" —
enforced by CI greps and by the sidecar's scrubbing error handlers, with tests table-driven over
every persona value.

## Regulatory & Claims Governance

| Status | Item | Note |
|---|---|---|
| ⬜ | Copy lint in CI | **Not built.** CI has guardrail greps for biometrics-in-logs and rule-logic-outside-the-engine, but **no banned-vocabulary lint**. I checked the app copy by hand; that is not the same as enforcing it. |
| 🚫 | All eight DECISION tasks | Still pending. Three are now answerable with evidence — see below. |
| ⬜ | Everything else (intended-purpose statement, claims audit, DPIA, IEC 62304, ISO 14971, consultant) | Non-engineering, not started. |

## Content Library

| Status | Story | Evidence |
|---|---|---|
| ✅ | Controlled food vocabulary and tagging scheme | `food-tags.json` exists; the loader fails fatally on any tag outside it. |
| ⬜ | Meal library, tagging pass, activity library, basket reconciliation check | Not started. **Still on the critical path** — a rules engine with an empty library produces an empty app. |

## QA, DevOps & Release

| Status | Story | Evidence / what's missing |
|---|---|---|
| 🟡 | Engine backtest and regression suite | Harness ✅ and a CI smoke run ✅. **Not enforced per rulebook change**, and fire-rate drift does not surface as a review comment. |
| ⬜ | IaC, CI/CD + EAS, observability, release engineering, device matrix, a11y audit, E2E loop, PM | Not started. |

---

## Work done that has no story in the CSV

Four things exist in the repo with nowhere to log them:

1. **Backtest harness** (`services/engine/backtest/`) — per-rule fire rates, co-firing matrix,
   synthetic sweep generator, 45 tests. Closest story is "Golden fixture expansion and backtest
   harness", which is estimated at 16h and only partly describes it.
2. **Demo fixtures and driver** (`packages/demo-fixtures`, `services/engine/demo_driver`) — three
   scripted personas, a deterministic day-clock, the 3→6 app-state mapping as reviewable data.
3. **Veyos → Weyos rename**, including durable identifiers and ADR 0005 for the schema `$id`.
4. **Design pack imported** to `docs/design/` — all 59 surfaces, openable in a browser.

## Three decisions that are now answerable with evidence

- **Percent vs z-score.** No rule condition defines `value_z`, so z-score silently falls back to
  percent and the two modes are indistinguishable by any backtest. Someone must author z-score
  thresholds before the decision can be made at all.
- **Rule 1.4 / the James gap.** The design pack gives James a *missing* wrist temperature, which
  makes 1.3 unevaluable and puts him in Partial. `personas.json` gives him `0.1` — present and
  normal — so 1.3 resolves FALSE and he lands in "in balance today". **The false reassurance is
  partly a fixture artefact**, and under the pack's data three-valued evaluation already does the
  right thing without rule 1.4.
- **"In balance" unreachable with cycle data.** Confirmed programmatically: L2 covers days 1–28
  with no gaps and `calm` means only-always-on-L3-fired, so a cycle-tracking subject is never calm.
