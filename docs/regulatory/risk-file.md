# Risk management file — ISO 14971 (initiated)

| | |
|---|---|
| **Status** | **DRAFT — initiated 2026-09-14, not yet reviewed** |
| **Scope** | The arbitration engine (`services/engine`), the rulebook (`config/rules/`), and the paths a decision takes to the user (sidecar, API, app) |
| **Intended purpose** | `docs/regulatory/intended-purpose.md` (itself a draft, SCRUM-121) |
| **Risk owner** | *To be named* |
| **Review cadence** | **Quarterly**, plus the triggers in §5. Next due: **2026-12-14** |
| **Ticket** | SCRUM-133 |

Weyos is positioned as wellness, not a medical device (`docs/compliance.md`). This file exists
anyway, as the ticket says, because the engine gives advice about a human body and its failure
modes are knowable in advance. If classification ever tips toward a regulated pathway, this is
the file that has to exist already.

The structure follows ISO 14971: hazard → sequence of events → hazardous situation → harm, then
risk controls, verification of each control, and residual risk. **It is initiated, not
complete.** Severity is proposed. Probability isn't estimated, because there is no field data yet.
The backtest harness gives rule fire rates, not harm rates. Acceptability is for the risk owner
to set.

---

## 1. Scales (proposed, for sign-off)

**Severity**

| | |
|---|---|
| S1 Negligible | Inconvenience; a lost or unnecessary training session |
| S2 Minor | Short-lived discomfort; a poor food or exercise choice with no lasting effect |
| S3 Serious | Delayed attention to a developing illness; an unsuitable diet or supplement sustained over weeks |
| S4 Critical | Delayed care in a situation that needed it promptly |

**Probability.** P1–P5 (improbable → frequent), to be estimated from recorded signal history once
live data exists. Until then every row reads *not estimated*.

**Acceptability.** Not set. The risk owner defines it before the first quarterly review.

## 2. Risk controls available in this system

These are the control mechanisms the rows below refer to. Each one is verified by a test that runs
in CI.

| Control | What it guarantees | Verified by |
|---|---|---|
| **C1 Three-valued evaluation** | A missing signal makes a rule UNKNOWN, never FALSE, so the engine can't turn "no data" into "all clear" | `test_three_valued.py`, F14, F17, F18; sidecar `unevaluable_rule_ids` tests |
| **C2 Precedence** | L1 > L5 > L2 > L3 > L4 on activity, food, modifiers and constraints | F9, F10, `test_precedence.py` (all pairs), priority-band test |
| **C3 Golden fixtures** | Each known behaviour, including known defects, is pinned; a change to one fails CI; strict xfails fail when a spec question is answered in code | `tests/fixtures/golden.yaml`, `test_golden.py` |
| **C4 Determinism** | Same snapshot + same rulebook → byte-identical decision; content-hash decision id | `test_engine_is_deterministic`, ADR 0006, sidecar id tests |
| **C5 Engine purity** | No network, clock, randomness or DB in the engine | AST import test, CI env check, ADR 0004 |
| **C6 Rulebook validation** | Duplicate ids or priorities, unknown layers, and food tags outside the vocabulary are fatal at load | `config.py::_validate` |
| **C7 Warnings surfaced** | Collisions, cold start, cycle day > 28, a missing baseline and z-score fallback become warnings on the decision, not silent choices | F10, F12, F13; `presentation.warning_kinds` |
| **C8 Layer separation** | With the elemental layer off, only L1/L2/L5 decide | F11 |
| **C9 Transparency** | Every output carries the rule and the delta behind it; the trace is shown to the user | Trace screen (C3), `test_every_fired_output_is_traceable` |
| **C10 No leakage** | No raw biometric value in errors, logs or traces | Sidecar leakage tests, CI grep, `test_no_raw_biometric_values_leak_into_reasons` |
| **C11 Information for safety** | Wellness disclaimer on every screen; emergency guidance in A1/H7; "no doses" on supplements | Design pack; disclaimer built. A1/H7 not built |
| **C12 Copy lint** | No banned clinical vocabulary or judgemental tone in user copy | `tools/copy-lint` (SCRUM-123, in review) |

## 3. Hazard analysis

"Open" means there is a decision behind the row that no one has made. The reference points to
where the decision is tracked.

| ID | Hazard → sequence → hazardous situation | Harm | Sev. | Controls in place | Residual / open |
|---|---|---|---|---|---|
| **R1** | **False reassurance: the James gap.** RHR +26% above baseline with a temperature that is present and normal → rule 1.3's dual gate is FALSE → state `calm`, "in balance today". (With temperature *missing*, 1.3 is unevaluable and the day is Partial; see R2) | User trains hard or ignores a developing illness | S3 | C3 (F19 pins it, F5b xfail), signal tiles always visible, so the RHR reading is on screen | **Open.** Candidate rule 1.4 unapproved (plan v2 §9.3). The fixture fix §3 asked for first is PR #17 |
| **R2** | **Missing data read as "fine".** A signal fails to sync → a rule that needed it is skipped → the user is told they're in balance | As R1 | S3 | **C1**, Partial state in the design, sidecar `unevaluable_rule_ids` | "Not applicable" (no cycle, no labs) is indistinguishable from "unevaluable"; the demo mapping narrows Partial to Layer 1 (`app-states.json`). **Open** |
| **R3** | **Cycle day > 28.** Long cycle → no Layer 2 rule fires → `calm` while the hormonal layer silently didn't apply | Advice ignores cycle phase | S2 | C7 (UNDEFINED warning), C3 (F13, `test_cycle_layer.py`) | **Open** spec question (CLAUDE.md) |
| **R4** | **Cold start.** Under 28 days of history → baseline-relative rules untrustworthy | Advice from a meaningless baseline | S2 | `insufficient_baseline` state, F12 | Cold start "under-designed" (CLAUDE.md); backfill (plan v2 P3) not built |
| **R5** | **Stale baseline or stale snapshot.** Yesterday's data, or an old baseline, drives today's decision | Advice doesn't match the body today | S2 | Engine reads no clock (C5), so `as_of` is whatever the snapshot says | **No staleness check exists.** The execution layer's staleness drop (plan v2 P4) isn't built |
| **R6** | **Stale lab result.** A lab from years ago, still flagged `high`, keeps firing Layer 5 | Diet/supplement changes for a value that no longer applies | S3 | None in the engine | **Gap.** `LabValue.collected_on` is stored (API migration 0002) but the engine never reads it. Needs a rule decision: max lab age |
| **R7** | **Precedence resolves the wrong way on an L1 collision.** A lower layer overrides a safety layer | Safety advice withdrawn | S3 | **C2** for every layer pair on every dimension; C3 | See R8 for the one dimension that doesn't follow precedence |
| **R8** | **A lower layer's block beats a higher layer's mandate** (F16). E.g. Vata (L3) blocks raw on an Ovulatory (L2) day that mandates it | Higher-layer food guidance silently dropped | S2 | Pinned: F16, `test_precedence.py`; trace records the suppression (C9) | **Open** spec question (SCRUM-79, in review) |
| **R9** | **L1 addition collides with a lower-layer block.** Ginger tea (hot) for a Pitta on a 30 °C day | Unsuitable item; reads as contradictory | S1 | C7 warning, F10 | Per-item substitution unresolved (CLAUDE.md) |
| **R10** | **Two Layer 2 phases fire together** after a range edit | Contradictory cycle advice | S2 | Partition test and overlap-warning test (`test_cycle_layer.py`), C7 | Priority doesn't arbitrate within L2; only the ranges do |
| **R11** | **Rulebook misconfiguration.** A bad priority, tag or layer ships | Arbitrary arbitration | S3 | **C6**; priority-band test; fixtures per rule change | `_known_food_tags()` fails **open** if `food-tags.json` is missing; priority bands are enforced by a test, not at load |
| **R12** | **Wrong comparison mode.** Z-score requested but no `value_z` → silent fallback to percent | Thresholds not what the author meant | S2 | C7 warning | **Open**, plan v2 §9.6 |
| **R13** | **Rule 1.2 reads the wrong measurement.** A composite sleep score used as stage percentages | Sleep rule fires or doesn't for the wrong reason | S2 | Signal named explicitly; composite kept display-only; null → unevaluable (C1) | **Open**, plan v2 §9.5 |
| **R14** | **Heat-wave rule suppressed in validated-only mode.** 4.2 is Layer 4 | No indoor/hydration advice in heat | S2 | — | **Open**, plan v2 §9.8 |
| **R15** | **Elemental layer leaks into validated-only mode** | A claim to regulators becomes untrue | S2 | **C8**, F11 | — |
| **R16** | **Supplement suggestion interacts with medication** | Adverse interaction | S3 | No doses; pharmacist/doctor caveat in the design (C11) | Caveat screen not built; no medication input by design |
| **R17** | **Calorie increase or macro floors for someone with an eating disorder** (2.3 `kcal_delta`, 5.3 minimums) | Harm to a vulnerable user | S3 | — | **No population exclusions written** (intended-purpose §4.6) |
| **R18** | **User relies on Weyos in an emergency** | Delayed emergency care | S4 | C11 emergency copy (A1, H7) | A1/H7 not built |
| **R19** | **Agent narrates, overrides or re-weights a health judgement** | Unexplainable advice; an L1 decision softened | S3 | CLAUDE.md non-negotiables 7–8 | Guardrails and evals (plan v2 §6.3, §6.6) not built |
| **R20** | **Fixture data reaches a real user** | Advice for someone else's body | S3 | CLAUDE.md non-negotiable 9 | **Gap, fix in review (PR #14).** `services/api/src/decision/personas.source.ts:74` defaults `WEYOS_DEMO_FIXTURES` to **on**, and with demo off and no store it fell back to fixtures. `personas.source.spec.ts` pinned both |
| **R21** | **Raw biometric leaks** into logs, errors or analytics | Privacy harm (special-category data) | S2 | **C10** | — |
| **R22** | **A decision can't be reconstructed** after a complaint | Cannot investigate harm | S2 | **C4**, trace (C9) | Decisions are persisted only once the API store lands (storage ADR, being renumbered 0007 → 0008 in PR #15) |
| **R23** | **False alarm.** 1.3 fires on temperature + RHR for a benign cause → rest day | Lost training | S1 | Transparent reasoning (C9); user can decline ("Not for me" on design screen C2) | Acceptable in principle; to confirm |

## 4. Actions arising (not done here)

Actions only. Each needs an owner, and none has been changed in code:

1. **R20:** flip the demo default off, remove the fixture fallback, and update the spec that pins
   both. This violates non-negotiable 9 as written. **In review: PR #14.**
2. **R6:** decide a maximum lab age, then add it as rulebook config with a fixture.
3. **R17 / R16:** write population exclusions into the intended purpose.
4. **R11:** make a missing `food-tags.json` fatal, and consider enforcing priority bands at load.
5. **R5:** define staleness for snapshots and baselines before the execution layer is built.

## 5. Review

Quarterly, and additionally whenever any of these happens:

- a rulebook change (new rule, threshold, priority, layer, tag). The PR template asks for it;
- a new signal, lab or data source;
- any answer to a plan v2 §9 decision, or to a CLAUDE.md open spec question;
- a change to the intended purpose;
- the agent gaining a tool;
- any user complaint alleging harm.

| Date | Reviewer | Scope | Outcome |
|---|---|---|---|
| 2026-09-14 | Claude Code (initiated) | Initial hazard identification from the repo, fixtures and open questions | Draft. Needs a risk owner and a first human review |
