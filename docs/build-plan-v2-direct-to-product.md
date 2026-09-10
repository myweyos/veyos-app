# Weyos — Build Plan v2: direct to product

**Version** 2.0 · **Date** 2026-09-10 · **Status** SUPERSEDES `docs/build-plan-stage1-wrapper.md`
**Audience** Claude Code working in this repo, and the engineers supervising it.

---

## 0. Read this first

The plan has changed. **There is no investor demo stage.** The staged path — Stage 1 demo on
fixture data, Stage 2 functional build, Stage 3 launch readiness — is cancelled. We build the
full MVP as specified, on live signals, from now on.

Two decisions define v2:

1. **Direct to product.** Full MVP as specced — all five layers, the complete surface set, UK and
   US — running on real HealthKit / Health Connect / BLE data against a real backend. No fixture
   demo mode, no scripted rehearsal, no compile-flagged demo controls. Ever.
2. **Full agent orchestration, not a chat wrapper.** The conversational layer is not a text veneer
   over the decision object. It is an orchestration layer with a tool surface that can both read
   state and *take actions*, under a deterministic authority model. §6.

Everything below is the consequence of those two sentences.

**Four rules still govern this document, unchanged from v1:**

1. **Do not resolve open spec questions in code.** §9 is the list. If a task needs one answered,
   stop and ask.
2. **Work phase by phase.** §7. Do not start a phase whose predecessor is not green.
3. **Every number here is a planning estimate**, not an approved figure. Do not quote them outward
   as commitments.
4. **The product is spelled `Weyos`.** The rename shipped (ADR 0005). Any `Veyos` string outside a
   historical doc title or the GitHub repo slug is a bug.

---

## 1. What is being built, in one paragraph

Weyos ingests biometric signals from a user's own wearable — HRV, resting heart rate, sleep,
wrist temperature, steps, plus optional lab values — normalises them into one canonical schema,
learns that person's baseline, and runs each day's snapshot through a deterministic 5-layer
rulebook that produces exactly one intervention. The app is quiet almost all the time; when the
engine fires, it overrides the user's own planned activity and shows exactly what changed, what
it is doing about it, and why, with a full decision trace one tap away. On top of that sits an
agent that the user can talk to, which can answer from the engine's state and act on the user's
plan — never inventing a health judgement of its own.

**What "done" means now:** a real person installs the app from TestFlight / internal track,
connects their own Apple Watch or Android wearable, waits out (or backfills past) calibration, and
starts receiving interventions derived from their own body — with consent, export and delete
working, in the region they live in.

That is a materially different finish line from "a phone a founder can hand to an investor," and
the difference is almost entirely in the layers of the stack the demo let us skip.

---

## 2. What is cancelled

Delete these from the plan. Do not build them, do not carry tickets for them.

| Cancelled | Why |
|---|---|
| Demo mode: scenario switcher, "simulate", reset, compile flag | There is no demo. The build-flag work and the "no demo control reachable in production" test are moot. |
| The eight-minute rehearsal script and screenshot pack | Not a deliverable. |
| "Stage 1 acceptance = a TestFlight build running on fixtures" | Replaced by §7's acceptance criteria, which are all live-data. |
| Fixture data as a *product* input path | Fixtures survive as **tests and dev harness only** — see §3. |
| The 456 / 377 / 86 hour stage split | Replaced by §8. |

**What survives from v1 and is still authoritative:** §4 hard constraints (all 13), the design
appendix (`docs/design/`), the five-stage guardrail model (now extended, §6.3), the deterministic
renderer as the safety floor (§6.4), and every open decision in §9.

---

## 3. What changes about fixtures and personas

`packages/demo-fixtures`, `services/engine/demo_driver` and `services/engine/tests/fixtures/golden.yaml`
do not go away. Their **job** changes.

- They are the regression net and the local dev harness. Keep them green; keep adding to them.
- They are **not** a runtime data source in any build. No screen, no API route, no agent tool may
  read a persona in a build that a user could install.
- The scenario switcher stays as a *dev-only harness* — a plain dev-menu screen, not a designed
  surface, not something we polish, not something that ships in a release build.
- `personas.json` and the design pack disagree about James's wrist temperature (`0.1` vs missing).
  That disagreement is now a **test-data bug**, not a product question. Fix the fixture to match
  the pack, and re-derive what rule 1.4 is actually for (§9.3).

Rename the package to `packages/test-fixtures` in Phase 1 so nobody inherits the word "demo".

---

## 4. The five things that just moved onto the critical path

Under the demo plan, everything below Layer "app + engine + fixtures" was Stage 2 or Stage 3 work.
It is now day-one work, and this is the entire cost of the change of direction.

### 4.1 Apple Developer and Play Console enrolment — **start today**

Not started as of 2026-09-01. It blocks all six Native Signals stories, and Expo Go cannot load
HealthKit / Health Connect / BLE / background modules, so dev builds are mandatory. This is pure
calendar, zero engineering content, and it is now the long pole in front of the *product*, not in
front of a demo. Also order the test-device matrix and at least one BLE chest strap.

### 4.2 There is no database in this repo

Stated plainly because it is easy to miss: **no driver, no ORM, no migration, no connection
string.** The ingestion API validates payloads at the boundary and then drops them. Decisions are
minted and not persisted. On the demo path that was fine. On the product path it is the largest
single new workstream:

- Managed Postgres + TimescaleDB, managed Redis, per-region.
- Canonical normalisation layer — vendor shapes (HealthKit, Health Connect, BLE) die here and
  never appear downstream (`docs/architecture.md` §3).
- Snapshot storage, baseline computation from **real** history rather than synthetic sweeps.
- Decision persistence **before** dispatch. Exactly-once depends on it.
- Auth, sessions, account lifecycle.
- UK and US residency and routing. This is a compliance requirement, not an optimisation.

### 4.3 Native signals and the cold-start problem become real

The demo never had a cold start. A real user does: 2–4 weeks between install and a usable
baseline, which is where consumer wellness apps churn.

**Historical backfill at connect is now the highest-leverage item in the entire build.** HealthKit
and Health Connect both hold history; ingesting up to 90 days at pairing collapses the wait from
weeks to minutes. ~8–16h, and it is not in any estimate. Do it in Phase 2, not later.

Cold-start copy promises **Layer 3 only** — L3 needs no baseline, L5 fires only on a present and
abnormal lab value, which for a day-one user is usually nothing.

### 4.4 The execution and delivery layer

Exactly-once semantics, the intervention state machine, quiet hours with a 90-minute staleness
drop, one-re-fire-max snooze, APNs/FCM, and the rule that a foregrounded app renders in-app and
sends **no** push. Six stories, none started. A duplicate "your HRV dropped" alert destroys the
credibility the whole design rests on.

### 4.5 Privacy and compliance move from "launch readiness" to "before the first real user"

Nine stories, none started. On a fixture demo, consent was a screen. On a live product, **consent
has to exist before the first byte of a real person's Article 9 health data is ingested.** Eight
granular unbundled toggles (analytics off by default, voice off by default), export and delete two
taps from H5, DPIA, ICO registration, the US privacy stack, per-region legal copy, and the
banned-vocabulary copy lint in CI — which does not exist today and is currently a manual check.

---

## 5. The content library is still the quiet killer

140h — meal library (~30 recipes × 2 baskets × 2 markets, tagged), activity library (~20 sessions),
the tagging pass. The controlled vocabulary exists and the loader enforces it; the library behind
it is empty. **A rules engine with an empty library produces an empty app**, and on the product
path that is not a demo that looks thin, it is a user whose plate is empty when two rule blocks
stack. Decide who writes this content before Phase 5, and treat the basket ⟷ trace reconciliation
check as a CI gate, not a nice-to-have.

---

## 6. Agent orchestration — the full version

This replaces §6 of the v1 plan. The decision is **full agent orchestration**: an agent that
answers from the engine's state *and acts on the user's behalf*, not a conversational renderer.

### 6.1 The authority model — read this before writing any agent code

There is exactly one line that cannot move:

> **The deterministic engine is the sole author of every health judgement. The agent orchestrates
> around it. The agent never decides, never overrides, never re-weights, never narrates a Layer 1
> decision.**

Everything the agent is allowed to say about the user's body arrives as an already-decided,
structured object. Everything the agent is allowed to *do* is a bounded effect on things the user
owns — their plan, their preferences, their responses — never on the arbitration.

Three tiers, and every tool belongs to exactly one:

| Tier | What it is | Authority |
|---|---|---|
| **Read** | `get_today_state`, `get_signal`, `get_trace`, `get_plan`, `get_meal`, `get_basket`, `list_layers`, `get_calibration_status`, `get_history` | Free. Returns structured facts. `status: unknown` reaches the model as **unknown**, never omitted, never zero. |
| **Act** | `add_planned_activity`, `move_planned_activity`, `remove_planned_activity`, `record_response(do_now\|later\|not_for_me + reason)`, `set_quiet_hours`, `mark_activity_complete`, `add_lab_value`, `copy_basket` | Mutating. Every call goes through the effect layer, §6.2. |
| **Terminal** | `escalate_to_takeover`, `emit_refusal`, `emit_distress` | Ends the turn. Hands control to a structured surface. |

Explicitly **not** tools, and not negotiable: anything that writes a signal, edits a baseline,
changes a rule, changes consent state, suppresses a decision, or alters a stored trace. Consent is
changed by a human in a consent surface, never by an agent, in either direction.

### 6.2 The effect layer

Every Act-tier call is a *proposed* action, not an executed one. Between the model and the
database sits a layer that does four things, in order:

1. **Precondition check.** Deterministic, in code. Does the object exist, does it belong to this
   user, is it in a state that permits this transition, does it contradict a decision the engine
   made today? A contradiction is a refusal, not a warning.
2. **Confirmation policy.** Reversible and small (moving tonight's run by an hour) executes and
   reports. Irreversible or consequential (recording "not for me", entering a lab value, changing
   quiet hours) renders a structured confirmation the user taps. The agent never confirms on the
   user's behalf, and never treats silence as consent.
3. **Idempotency.** Every action carries a turn-scoped key. A retried tool call, a reconnected
   stream, a duplicated turn must not double-apply. Assume the model will retry.
4. **Audit.** Every proposed action, its outcome, the turn that produced it and the context hash it
   was reasoning over are written to an append-only log. This is the same trust surface as the
   decision trace, for the half of the product the engine does not author.

### 6.3 The guardrail stack, extended

The five-stage stack from v1 survives and gains an action path. Fail closed at every stage.

```
 user text
     │
 (1) INPUT CLASSIFIER  ── distress? ─────────► W8 template. Not logged. Stop.
     │                 ── out of scope? ─────► W3 refusal. Stop.
     │                 ── L1 active + today? ► W5 handoff to C2 takeover. Stop.
     ▼
 (2) CONTEXT BUILDER   ConversationContext from the decision object ONLY.
     │                 No raw store access. Context hash recorded.
     ▼
 (3) AGENT LOOP        tools (§6.1), bounded turns, bounded cost, streaming.
     │                 Act-tier calls → EFFECT LAYER (§6.2) → result back into the loop.
     ▼
 (4) OUTPUT VALIDATORS a. banned lexicon (regex + lemma)
     │                 b. grounding — every number and causal claim present in context
     │                 c. scope — no diagnosis, no dosage, no third-party advice
     │                 d. tone — no should/must/failed/missed/streak
     │                 e. shape — the four sentence shapes
     │                 f. action consistency — the prose matches what the effect layer
     │                    actually did, including when it refused
     │
     ├── pass ──────────────────────────────► render
     └── fail ─► ONE repair attempt, violation named
                    └── still failing ─► (5) DETERMINISTIC FALLBACK (§6.4)
```

**New in v2:** validator (f). An agent that says "I've moved your run to 7pm" when the effect layer
refused is a worse failure than a banned word, because the user acts on it. Any mismatch is a hard
fail with no repair attempt — fall straight through to the deterministic path and report honestly.

**Prompt injection surface is wider now.** The user types planned-activity titles, decline reasons
and meal notes, and all of them enter context. Treat every user-authored string as data. An
instruction found inside a planned-activity title is a string, and the adversarial set must prove it.

### 6.4 The deterministic renderer is still built first

Unchanged from v1 and more important now. `DeterministicRenderer` — decision object + app state →
prose, one function per state, every sentence traceable to a fired rule, zero banned vocabulary.

It is three things at once: the fallback whenever the agent fails validation, the reference output
every eval compares against, and a shipping product if legal comes back negative on the generative
path. Build it before the agent, in Phase 6, and make it exhaustive over all six states including
declined and partial.

**Log every fallback, with the validator that fired.** Fallback rate is the health metric for the
whole agent. An agent that silently falls back on 40% of turns is the deterministic renderer with a
latency penalty and an LLM bill.

### 6.5 System prompt and provider

The system prompt is config, not code: `services/api/src/conversation/prompts/system.v1.md`,
versioned like the rulebook, never inlined in TypeScript. Contents as specified in v1 §6.4 — plus
one addition for v2: **what the agent may do, what requires confirmation, and the instruction that
it must never claim an action it did not receive a success result for.**

Provider choice is a **legal input, not an engineering preference** (§9.10). A health-adjacent
conversational surface in UK + US needs a data-residency answer, a retention answer and a
training-opt-out answer before a key is issued. Build behind a provider abstraction so the answer
can change without a rewrite.

### 6.6 Evals now cover actions

Three suites, all CI gates.

1. **Engine goldens** — existing, keep green. F9 (cross-layer precedence), F11 (layer separation),
   F5/F5b (the James gap).
2. **Conversational goldens** — a reference transcript per app state per persona, written *before*
   the system prompt.
3. **Adversarial + action set** — the one that decides whether the agent ships:
   - the v1 refusal set in full (condition naming, cardiac reassurance, dosage, third-party,
     "just tell me the risk", the honesty constraint, distress → W8 region-correct and not logged)
   - **action evals, new:** did it do the right thing, once, to the right object? Double-apply on
     retry. Acting on yesterday's plan. Acting on another user's object. Acting in contradiction to
     today's L1 decision. Claiming an action the effect layer refused. Confirming on the user's
     behalf.
   - prompt injection via every user-authored string that enters context.

A banned-vocabulary escape or a false action claim is a **build failure**, not a warning.

---

## 7. Phases

Two tracks that converge. Track A is platform and product; Track B is the agent. Track B cannot
start before Phase 6 exists, because the deterministic renderer is its floor.

| Phase | What | Acceptance |
|---|---|---|
| **0** | Orientation. Read the repo, `docs/`, the rulebook, `golden.yaml`, `docs/build-status.md`, the design pack. | A written summary of the decision-object contract a reviewer agrees with. Zero code. |
| **1** | Foundations. Protect `main` + required checks, fix CODEOWNERS (`@veyos/*` matches nothing), generate `shared-schema` (`index.ts` is hand-written, `generated.ts` has never been produced), environments + secrets + per-region deploy, rename `demo-fixtures` → `test-fixtures`. **Apple + Play enrolment starts day one.** | CI green with EAS build check. Generated schema. Enrolment submitted. |
| **2** | Data platform. Postgres + TimescaleDB, Redis, normalisation layer, snapshot storage, decision persistence, auth, region routing. | A real payload from a real device round-trips: validated → normalised → stored → retrievable. Decisions persisted before dispatch. |
| **3** | Native signals. HealthKit, Health Connect, BLE chest strap, background modes, on-device variance detection, **historical backfill at connect**. | Signals from a physical device on both platforms reach the store. Backfill collapses cold start to minutes, proven on a real account. |
| **4** | Engine in the live loop. Sidecar against stored snapshots, baselines from real history, the execution layer: exactly-once, state machine, quiet hours, APNs/FCM. | One decision → one notification, proven under reprocessing. Foregrounded app renders in-app and sends no push. |
| **5** | Design system + navigation. Finish the component inventory (**prose says 22, the list has 23 — reconcile and record, do not silently pick**), 4-tab bar + takeover modal route, snapshot tests, Dynamic Type XXL, reduced motion, dark palette (**the pack defines none — this is a design ask, not an invention**). | Every component in light and dark at XXL without truncating the verdict block or the takeover. |
| **6** | Screens. A1–A11, B1–B8, C1–C5, D, E, F, G1/G3, H1–H9, on live data. G2 greyed with a PHASE 2 badge. B8 and H9 ported from the pack — earlier hand-written versions were deleted, do not re-invent them. | The full non-agent surface set, live. Basket ⟷ trace reconciliation runs in CI. |
| **7** | **Deterministic renderer (reading a).** Six states → traceable prose. | Every state × every persona, correct, zero banned vocabulary. Perfect before Phase 8 starts. |
| **8** | Agent core. Context builder, read-tier tools, orchestrator, session model, streaming, versioned prompt, provider abstraction. | A turn round-trips end to end. The model can assert only what is in context. Every tool call logged. |
| **9** | Act tier + effect layer + guardrails + evals. §6.2, §6.3, §6.6. Then W1–W9, H10, the two new consents, the voice stub (capture → transcript → review/delete, **no TTS**). | Eval suite green in CI. Zero banned-vocabulary escapes. Zero false action claims. Fallback rate measured and reported per run. |
| **10** | Trust and compliance. Eight granular consents, export, delete, DPIA, ICO, US privacy stack, per-region legal copy, dependency allowlist, **banned-vocabulary copy lint in CI**. | Consent gates ingestion. Export and delete are two taps from H5 and actually work. |
| **11** | Launch. Device matrix, a11y audit, E2E intervention loop on real hardware, observability, release engineering, store submission. | The loop runs end to end on a real person's own data, on both platforms. |

**Phase 10 is drawn last for readability and must not be built last.** Consent is a gate on
ingesting real health data: the consent surfaces and the region switch have to land with Phase 3,
before a single real user's Article 9 data enters the store. The rest of Phase 10 can trail.

---

## 8. What this costs — planning estimate, not an approved figure

Derived from `Weyos_Estimate_v2_Basis.md`. Nothing has been re-priced; the stage split has been
removed and the previously-unallocated work has been made visible.

| Block | Hours | Source |
|---|---|---|
| Core MVP as specified (the old 456 + 377 + 86) | 919 | Estimate v2, Scenario A |
| Agent orchestration (see below) | ~480 | Reading (b) at 337 + the v2 action work |
| Content library | 140 | Previously excluded. Critical path |
| DevOps / infrastructure / release | 140 | Previously excluded |
| QA / test / device matrix | 140 | Previously excluded |
| Project management | 100 | Previously excluded |
| **Total** | **1,919** | |
| **+10% contingency** | **2,111** | |

**The agent line, broken out:**

| Line | Hours | Note |
|---|---|---|
| Chat surface — message list, composer, state header, session model | 40 | from (b) |
| Deterministic renderer (six states) | 45 | from (b); also the fallback and the eval reference |
| Intent routing + input classifier + W5 handoff | 45 | from (b) |
| Safety layer | 90 | from (b) |
| LLM orchestration — provider, streaming, tool loop, prompt versioning, cost controls | 40 | from (b) |
| Eval harness — goldens, adversarial, CI gate | 45 | from (b) |
| Voice stub — capture, transcript, review/delete, consent. No TTS | 14 | from (b) |
| Settings, two consents, transcript deletion | 18 | from (b) |
| **Act-tier tools + effect layer** (preconditions, confirmation policy, idempotency) | **+60** | **new in v2** |
| **Action-level evals** | **+30** | **new in v2** |
| **Audit / replay log + observability per turn** | **+25** | **new in v2** |
| **Session and memory model beyond a single conversation** | **+25** | **new in v2** |
| **Subtotal (W7 conversational onboarding excluded)** | **~477** | |

**Calendar, at 24 productive hours per builder per week:**

| Team | h/week | Weeks | Months |
|---|---|---|---|
| 2 builders | 48 | 44.0 | ~10.1 |
| 3 builders | 72 | 29.3 | ~6.8 |
| 4 builders | 96 | 22.0 | ~5.1 |

**Three honest notes.**

1. The 520h of content, DevOps, QA and PM was excluded from every prior estimate. It has not grown
   — it has become visible. If it lands on the same builders, the two-builder line above is what
   happens; that is not pessimism, it is the arithmetic that was always underneath the 4-month
   number.
2. **The demo is not lost, it is relocated.** At the end of Phase 6 there is an installable app
   running on a builder's own wearable. That demos better than a scripted fixture run, because
   nothing in it is staged — and it arrives without a workstream built solely to be thrown away.
3. Levers, if the answer is "too long": cut astro/numerology (−76h, §9.1), UK-only at launch
   (−32h, contradicts both-markets-day-one), trim the meal library to 12 recipes (−54h, risks an
   empty plate when two blocks stack), defer the Act tier and ship a read-only agent first
   (−115h, and the agent becomes a very good answering machine).

---

## 9. Decisions that block work — answer these, do not code around them

Each one has a named owner decision behind it. Claude Code stops and asks.

1. **Astro / numerology — in or out?** 76h. H9 currently tells users in writing that Weyos does not
   use a birth chart, star sign or numerology. If it ships, **H9's copy changes in the same
   release**, never after. Answer before Phase 6.
2. **Dosha vs baseline phenotype.** The Baseline Phenotype epic (10 stories, all not started)
   *replaces* the dosha model, and rules 3.1–3.3 fire on dosha membership today. Personas, golden
   fixtures, the L3 trace rows and the food chain all assume dosha. **This is the largest single
   source of rework in the backlog and it collides with work already done.** Answer before Phase 4.
3. **Rule 1.4 — elevated RHR alone.** Now partly a fixture artefact: under the design pack's data,
   James's wrist temperature is *missing*, 1.3 is unevaluable, and three-valued evaluation already
   puts him in Partial without 1.4. Fix the fixture first (§3), then decide whether 1.4 exists.
4. **Rule 4.4 — pollen / air quality.** Is it a signal in the model at all? The pitch materials
   describe it; the rulebook has it `enabled: false`.
5. **Rule 1.2 — sleep stage percentages or a vendor composite?** Different cross-platform
   availability, and on live data this now decides what we can actually read from each vendor. The
   tile must show what the rule acted on. Answer before Phase 3.
6. **Percent vs z-score.** No rule condition defines `value_z`, so z-score silently falls back to
   percent and no backtest can distinguish them. **Someone must author z-score thresholds before
   the ADR can be written at all.** The patent recites z-score; the rulebook uses percent.
7. **"In balance" is unreachable for any user with cycle data.** Confirmed programmatically: L2
   covers days 1–28 with no gaps and calm means only-always-on-L3-fired. A product definition
   decision, not a bug, and on live data it affects most female users every day.
8. **Heat-wave 4.2 in validated-only mode** — suppress, or promote to L1 as a safety rule?
9. **Five elemental scores or three?** The design assumes five; three breaks the pillar vocabulary
   (Pitta and Kapha both need water) and makes the five-arc mark decorative. ~6–10h once.
10. **LLM provider, data residency, retention, training opt-out.** All four are legal inputs. This
    now blocks Phase 8, not a demo.
11. **Is the conversation retained at all?** H10 has a "keep my messages" toggle; its default is a
    legal decision.
12. **Does the agent ship on by default?** H10 can switch it off and return the app to the v0.4
    design exactly. Which way it points on first run pulls against A1's tagline, *"Weyos watches,
    so you don't have to."*
13. **W7 — conversational onboarding: in or out?** Only worth building if it *replaces* A1–A11.
    Shipping both doubles the onboarding surface for no gain. +30h / −24h.
14. **Who writes the content library?** 140h, critical path, §5.
15. **Is DevOps / QA / PM funded separately or absorbed?** §8's calendar table is the whole answer.

---

## 10. First seven things to do

1. **Start Apple Developer and Play Console enrolment.** Today. Zero engineering content, longest
   lead time in front of the product.
2. **Order the device matrix and a BLE chest strap.** Nothing in Phase 3 can be verified without them.
3. **Answer decision 2 (dosha vs phenotype).** It collides with completed work; every week it waits
   makes the rework larger.
4. **Answer decision 1 (astro).** Twenty minutes, 76h, and it changes user-facing copy.
5. **Open the LLM provider / residency / retention question with legal.** It gates Phase 8 and it is
   the only item that can invalidate the orchestration decision after it is built.
6. **Protect `main`, fix CODEOWNERS, generate the schema.** An afternoon; three known-broken things.
7. **Run P0** — orientation — and read what comes back before anything is written.

---

## 11. Prompt pack

Sequenced. Deliberately narrow. Do not merge them.

**P0 — orient.** *"Read `CLAUDE.md`, everything in `docs/` including `build-status.md` and this
plan, `config/rules/rules.v1.yaml`, `packages/shared-schema`, and
`services/engine/tests/fixtures/golden.yaml`. Summarise the decision-object contract, the
three-valued evaluation model, and the food resolution chain. List every assumption you had to
make. Write no code."*

**P1 — foundations.** *"Protect main with required checks. Fix CODEOWNERS — the `@veyos/*` teams do
not exist so it matches nothing. Make `packages/shared-schema/src/generated.ts` actually generated
and wire `npm run generate` into CI. Rename `packages/demo-fixtures` to `packages/test-fixtures`
and update every import. Add an EAS build check to CI."*

**P2 — data platform.** *"Stand up Postgres + TimescaleDB and Redis behind managed services, with
per-region configuration for UK and US. Implement the canonical normalisation layer so vendor
shapes die at the boundary. Persist signal snapshots and persist every decision before dispatch.
Write the ADR for the storage model and the residency approach."*

**P3 — native signals.** *"Implement HealthKit and Health Connect ingestion, BLE chest-strap
pairing, background modes and on-device variance detection, per `docs/architecture.md`. Implement
historical backfill at connect, up to 90 days, and prove it collapses cold start on a real
account."*

**P4 — execution layer.** *"Implement the intervention state machine with exactly-once delivery:
one decision, one notification; quiet-hours hold with a 90-minute staleness drop; one re-fire max
on snooze; foregrounded app renders in-app and sends no push. Prove it under snapshot
reprocessing."*

**P5 — design system.** *"Finish the component inventory from design spec §5.7 on `tokens.json`.
The prose says 22 components and the list has 23 — tell me which you found and do not silently
pick one. There is no dark palette in the pack; raise it rather than inventing one. Light, dark and
Dynamic Type XXL snapshots for every component. Then build the 4-tab bar and the takeover modal
route."*

**P6 — screens.** *"Build section [A|B|C|D|E|F|G|H] per the design pack, on live data. B8 and H9 are
ported from `docs/design/`, not re-invented — earlier hand-written versions were deleted for
drifting. G2 is greyed with a PHASE 2 badge."* — run once per section.

**P7 — deterministic renderer.** *"Build `DeterministicRenderer`: decision object + app state →
prose, one function per state, every sentence traceable to a fired rule, zero words from the banned
list. Exhaustive over all six states including declined and partial. This is the agent's fallback,
so it must be correct before any agent work starts."*

**P8 — agent core.** *"Build `ConversationContext` and the read-tier tool surface from §6.1. The
model must be structurally unable to read a signal that did not come through this builder.
`status: unknown` must reach the model as unknown. Then build the orchestrator: `/conversation/turn`,
streaming, session model, tool loop, versioned system prompt loaded from `prompts/system.v1.md`
behind a provider abstraction. No prompt text in TypeScript."*

**P9 — effect layer.** *"Build the Act tier and the effect layer from §6.2: precondition checks in
code, confirmation policy, turn-scoped idempotency keys, append-only audit log. An action that
contradicts today's engine decision is refused, not warned. The agent never confirms on the user's
behalf."*

**P10 — guardrails and evals.** *"Build the six output validators from §6.3 including action
consistency, one repair attempt, deterministic fallback, fail closed. Then the eval harness from
§6.6: conversational goldens, the adversarial set, the action set, prompt injection through every
user-authored string. Wire it as a CI gate — a banned-vocabulary escape or a false action claim
fails the build."*

**P11 — agent UI.** *"Build W1–W9 and H10 per the v0.5 changelog plus the two new A4 consents. The
agent is the root; the tab bar is unchanged; H10 switches it off and returns the app to the v0.4
design exactly. W5 hands off to C2 — never narrate a Layer 1 decision."*

**P12 — voice stub.** *"Mic capture → transcription → transcript review and delete. Consent default
off. No TTS. Make the absence of TTS a documented boundary, not a TODO."*

**P13 — compliance.** *"Build the eight granular consents with consequence lines, gate ingestion on
them, implement export and delete two taps from H5, add the banned-vocabulary copy lint to CI, and
the dependency allowlist."*

---

*Every figure in this document is a planning estimate and must be validated by the build team
before it is committed to. Where a number is inherited from an upstream document, the source is
named beside it.*
