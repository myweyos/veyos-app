# Getting Veyos into GitHub and moving — first five days

Written for JB, 2026-08-18. This is what one person can do with Claude Code while the second
engineer is still ramping, ordered so that nothing you build now gets thrown away when they
arrive.

---

## Day 0 (30 minutes) — get it into GitHub

```bash
# 1. Create the org and repo (private).
gh auth login
gh repo create veyos/veyos --private --description "Veyos — biometric arbitration platform"

# 2. Push this bootstrap.
cd veyos
git init -b main
git add .
git commit -m "chore: bootstrap monorepo, rulebook v1, arbitration engine, golden fixtures"
git remote add origin git@github.com:veyos/veyos.git
git push -u origin main

# 3. Protect main before anyone can push to it by accident.
gh api -X PUT repos/veyos/veyos/branches/main/protection \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=Engine (golden fixtures)' \
  -f 'required_status_checks[contexts][]=Contract (schema is the source of truth)' \
  -F 'enforce_admins=true' \
  -F 'required_pull_request_reviews[required_approving_review_count]=1' \
  -F 'restrictions=null'

# 4. Sanity check.
make setup && make engine-test
```

Then, in the GitHub UI: create the teams referenced in `.github/CODEOWNERS`
(`engineering`, `engineering-lead`, `product-owner`) or replace those handles with real
usernames — CODEOWNERS silently does nothing if the teams don't exist.

**Do this on day 0 too, because it is calendar risk and nothing else unblocks it:** start
the Apple Developer Program enrolment (org, needs a D-U-N-S number, 1–3 weeks) and the
Google Play Console account. No amount of code moves those dates.

---

## How to drive Claude Code on this repo

`CLAUDE.md` is already written and is the thing that makes Claude Code useful here rather
than merely fast. It encodes the non-negotiables (engine is pure, rules are config, every
rule change ships a fixture) and — more importantly — the list of **open spec questions that
must not be silently resolved in code**. That list is the difference between an agent that
surfaces the James gap and one that quietly invents a threshold to make a test pass.

Three habits worth keeping:

1. **Work in one vertical slice per session.** "Add the HealthKit module" not "build the
   mobile app". Long sessions on this codebase drift toward inventing rules.
2. **Ask for the trace, not the diff.** After any engine change: `make decision PERSONA=alex
   STATE=crash`. Reading what it decided is far faster than reading the arbitration code.
3. **When Claude proposes resolving an open question, stop it.** The right output is a
   `[SPEC]` issue, not a code change. There's an issue template for exactly this.

---

## The prompts, in order

Each is a single Claude Code session. They are ordered so that anything the second engineer
picks up on day 1 has a contract and a test suite waiting for it.

### Track A — engine (highest value, zero external dependencies)

**A1. Backtest harness**
> Build a backtest harness in `services/engine/backtest/` that runs the rulebook over a
> directory of snapshot JSON files and reports, per rule: fire count, fire rate, and
> co-firing frequency with every other rule. Include a synthetic snapshot generator that
> sweeps HRV, RHR, temperature, sleep and cycle day across plausible ranges. Do not change
> the rulebook. The output I want is a table showing which rules almost never fire and which
> pairs always fire together — that tells us which thresholds are doing real work.

**A2. Percent vs z-score decision**
> Using the backtest harness, compare `comparison_mode: percent` against
> `comparison_mode: zscore` over the synthetic corpus. Report where the two disagree and how
> often. Add `value_z` values to the conditions that need them. Do not pick a winner — write
> the findings into `docs/adr/0005-comparison-mode.md` as a proposed ADR with the evidence.

**A3. Cold-start design**
> The 4–8 week cold-start period is under-designed. Read the `insufficient_baseline` path,
> then write `docs/adr/0006-cold-start.md` proposing 2–3 options for what the product does
> before a baseline exists (population priors? absolute thresholds? no interventions at
> all?). Add golden fixtures for whichever behaviour we already have so it can't drift.
> Flag anything that needs a product or clinical decision as a `[SPEC]` issue.

**A4. Fixture expansion**
> Grow the golden fixture suite to cover every rule at least once, including the ones no
> current fixture touches (2.2, 4.3, 5.2). Every new fixture is data in `golden.yaml` — do
> not add bespoke test functions. If a rule can't be triggered by any plausible snapshot,
> say so rather than contorting the data.

### Track B — contract (unblocks parallel work immediately)

**B1. Type generation**
> Wire `json-schema-to-typescript` so `packages/shared-schema/src/generated.ts` is produced
> from the schemas, delete the hand-written types in `src/index.ts` in favour of re-exports,
> and add a CI check that fails if the generated file is out of date with the schema.

**B2. Python contract models**
> Generate Pydantic models from the same JSON Schemas into
> `packages/shared-schema/python/veyos_schema/` and make the engine's `Snapshot.from_dict`
> validate against them at the boundary in a debug mode. Keep the engine's runtime
> dependency on Pydantic optional — the engine must stay importable with PyYAML alone.

### Track C — API

**C1. Make the ingestion path real**
> Implement the ingestion endpoint properly: validate, persist the snapshot to
> Postgres/Timescale via a migration-managed schema, and return 202 with a decision id.
> Add a `docker compose` integration test. Do not implement the engine call — ADR 0004 is
> still open.

**C2. Consent and audit**
> Implement per-signal-class consent records and an append-only audit log of every decision
> served, keyed by `subject_ref` and rulebook version. Read `docs/compliance.md` first. No
> biometric values in the audit log — rule ids, deltas and timestamps only.

### Track D — mobile (start early because of the long lead times)

**D1. Dev build proof**
> Get an EAS development build onto a physical device that reads a single real HealthKit
> value — resting heart rate — and prints it. No product UI. I want the whole path proven:
> native module → config plugin → EAS build → device → real value.

**D2. Decision screen against real engine output**
> Build the daily decision screen against a real `Decision` produced by
> `python -m veyos_engine.cli --persona sarah --state crash --json`. Show the prescribed
> activity, the meal changes with the reason for each removal, and the `because` lines.
> Showing why is the product. Do not invent data shapes — use `@veyos/shared-schema`.

---

## What to hand the second engineer on their day 1

They already have the training pack (handbook, engine deep dive, ramp plan, knowledge
check). Add these three things and they can be productive without blocking on you:

1. **Repo access + `make setup && make engine-test` green on their machine.** If that
   doesn't work in 20 minutes, fix the setup path — it's the first impression of the
   codebase.
2. **`CLAUDE.md`, `docs/engine.md`, and fixtures F5, F9, F11.** Those three fixtures teach
   the arbitration model faster than the spec does: F9 is precedence, F11 is layer
   separation, F5 is the known defect and the reason we don't trust "in balance today" yet.
3. **One owned track.** Give them Track C or Track D end to end. Splitting the engine
   between two people this early produces merge pain and diluted ownership of the one
   component that has to be right.

---

## What only you can decide (and what's blocked until you do)

| Decision | Blocks | Where it's tracked |
|---|---|---|
| Rule 1.4 (elevated RHR alone) — approve or reject | The James gap; the app currently says "in balance today" to a man with RHR 26% over baseline | Fixture F5b, `config/rules/rules.v1.yaml` |
| Rule 4.4 (pollen/air quality) — is it a signal at all? | James's persona story doesn't work without it | Rulebook, disabled |
| Does 1.2 read sleep *stages* or a vendor composite score? | Cross-platform availability of the signal | `docs/engine.md`, schema comment |
| Heat-wave (4.2) in validated-only mode — suppress or promote to L1? | What the clinical demo actually shows | `config/rules/rules.v1.yaml` features block |
| DevOps/QA/PM resourcing | The 3.5-month calendar; those hours are excluded from the 691h estimate | MVP scope doc |

The first four are 20 minutes of your time each and each one unblocks a fixture. The last one
is the one that quietly stretches the schedule if it goes unanswered.
