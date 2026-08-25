# The decision object contract

Phase 0 orientation deliverable. Written before any Stage 1 code, from the repo as it stands.

Source of truth, in this order: `packages/shared-schema/schemas/decision.schema.json` (the contract),
`services/engine/weyos_engine/{engine,evaluate,config,models}.py` (the implementation),
`services/engine/tests/fixtures/golden.yaml` (what is pinned). Where this document and any of those
disagree, they win and this document has a bug.

---

## 1. The shape

`decide(Snapshot, Rulebook) -> Decision`. Pure: no network, no DB, no clock, no randomness. The whole
of Stage 1 rests on that, because it is what makes 16 interacting rules testable without a phone, a
wearable or a backend — and what makes a decision reproducible from a stored snapshot plus a rulebook
version.

**Required (10):** `schema_version` (`const: 1`), `subject_ref`, `as_of` (a *date*, not date-time),
`rulebook_version`, `state`, `fired_rules`, `activity`, `food`, `supplements`, `trace`.

**Optional (4):** `elemental_layer_enabled`, `constraints`, `messages`, `warnings`.

| Field | Shape | Notes |
|---|---|---|
| `state` | `calm \| intervention \| insufficient_baseline` | **Three values. See §5.** |
| `fired_rules[]` | `{rule_id, name?, layer 1–5, priority, because[]}` | `because` carries deltas and thresholds only — never a raw value bound to a subject |
| `trace[]` | `{step, rule_id, detail}` | `step` ∈ `evaluate \| activity \| food \| supplements \| constraints`. The audit trail |
| `activity` | `{verdict, planned, prescribed, location, decided_by}` | `verdict` ∈ `allow \| downgrade \| substitute \| relocate \| rest` |
| `food` | `{meals[], mandated_tags[], blocked_tags[], …modifiers}` | each `meals[].removed[]` entry carries the `rule_id` that removed it |
| `supplements` | `string[]` | may be empty |
| `constraints` | free-form object | `additionalProperties: true` |
| `warnings` | `string[]` | non-fatal input problems the product must surface rather than swallow |

Food modifiers: `sodium_pct_delta`, `hydration_pct_delta`, `min_protein_g`, `min_fiber_g` (nullable
numbers) and `kcal_delta` (a nullable 2-element range, not a scalar).

---

## 2. Three-valued evaluation

A condition is TRUE, FALSE or **UNKNOWN**, and UNKNOWN is not FALSE. Missing HRV means "we cannot say
whether this person is in sympathetic overload", which is a different product state from "they are not".

- `when.all` — any FALSE short-circuits to FALSE. Otherwise a single UNKNOWN makes the rule UNKNOWN.
- `when.any` — any TRUE short-circuits to TRUE. Otherwise a single UNKNOWN makes the rule UNKNOWN.

A rule that is UNKNOWN **does not fire** and gets an `unevaluable:` trace row.

**Consequence worth stating plainly:** an `any` rule can only resolve FALSE when *every* signal it
references is present. Rule 5.3 reads `hba1c` OR `fasting_glucose`; a subject with an HbA1c and no
fasting glucose can never get a "no" from 5.3 — only "yes" or "we cannot say". Partial lab panels are
the norm.

**Warnings are not emitted for every UNKNOWN.** A missing *baseline* appends a warning
(`evaluate.py:89`). A missing *signal* does not — it produces a trace row and nothing else. Fixture F14
pins the trace, not a warning. `docs/engine.md` currently reads as though every UNKNOWN carries a
warning; it does not. Raised, not resolved.

---

## 3. Precedence

```
Layer 1 (biometric) > Layer 5 (labs) > Layer 2 (hormonal) > Layer 3 (constitution) > Layer 4 (environment)
   safety              diagnosed        cyclical             persistent              modifier
```

Lower `priority` number wins; 1.x=10s, 5.x=20s, 2.x=30s, 3.x=40s, 4.x=50s. Priorities are unique across
the whole rulebook and duplicates are a **fatal load error** — otherwise arbitration would depend on
YAML line order. The loader also fails fatally on duplicate ids, unknown layers, and food tags outside
`packages/shared-schema/schemas/food-tags.json`.

**Activity resolution.** Most restrictive fired rule wins:
`rest > substitute > downgrade > relocate > allow`. Ties break by precedence. A `relocate` from a
*losing* rule still applies its location to whatever survived — a rest day is still an indoor rest day.

**Food resolution.** Build-then-filter in strict **reverse** precedence, least authoritative first, so
the most authoritative layer gets the last word:

```
planned meals → L4 → L3 → L2 → L5 → L1
```

- Blocks remove items, and every removal records the rule id that caused it.
- A block **withdraws a mandate** from a less authoritative layer (fixture F9: luteal mandates complex
  carbs, an elevated HbA1c blocks them, the carbs lose).
- L1 `add_items` land in a synthesised `additions` slot so the user can see the engine put something on
  their plate. Note `additions` is **not** in the snapshot schema's slot enum — anything validating a
  decision slot against that enum will reject the one slot that matters most.
- When an L1 addition carries a tag a lower layer blocked, the item stays (precedence) and a **warning**
  is emitted. That is the ginger-for-a-Pitta case (F10): surfaced, not silently resolved.

Any prose describing a different food ordering is superseded; the code is right.

---

## 4. How `state` is actually computed

`engine.py:79-82`:

```python
always_on = book.always_on_layers()          # {3}
state = "calm" if all(rule.layer in always_on for rule, _ in fired) else "intervention"
if any(w.startswith("cold start") for w in warnings):
    state = "insufficient_baseline"
```

Three things follow, all of which matter downstream:

1. **`calm` means "only always-on Layer 3 fired"** — not "nothing is wrong".
2. **`all()` over an empty sequence is `True`**, so a decision where *nothing* fired reports `calm`.
   Dosha is schema-required so L3 always fires in practice, but the fallback is vacuous, not defensive.
3. **`insufficient_baseline` is cold start only** — `days_of_history < min_days_for_baseline`. It is not
   a general "data is thin" state.

---

## 5. Three engine states, six app states

The engine emits **three**. The product design needs **six**: calibrating, partial, in balance,
advisory, intervention, declined.

**No derivation layer exists anywhere in this repo.** Not in the engine, not in the API, not in the
client. That mapping is new work, and it is where several open questions live:

- `declined` is a *user action* on a served decision. It is not derivable from a Decision at all.
- `advisory` vs `intervention` — nothing in the Decision distinguishes them. Any split (verdict
  severity, winning layer, rule count) would be a new arbitration rule outside `config/rules/`.
- `partial` vs `calibrating` — the boundary is undesigned. `insufficient_baseline` is cold start;
  "partial" most likely means partial permissions or a signal absent today, which the engine expresses
  as `unevaluable` trace rows.
- **F5, the James gap.** James's crash yields `state: calm` with **no warnings and no unevaluable rows** —
  1.3's dual gate (temp ≥ 0.5 °C *and* elevated RHR) evaluates cleanly to FALSE. So F5 is
  **indistinguishable from a genuinely calm day by any field the Decision currently carries.** It cannot
  be routed to `partial` without enabling rule 1.4 or changing the contract.
- **F13, the same defect class.** `cycle_day: 31` also yields `calm` — with a warning, but no unevaluable
  rows — so the app would say "in balance today" while the entire hormonal layer silently did not
  evaluate. Not previously written down.
- **`in balance` is structurally unreachable for any cycle-tracking subject.** L2 covers days 1–5, 6–13,
  14–15 and 16–28 with no gaps, and `calm` requires *every* fired rule to be on an always-on layer.
  Sarah with `tracked: true` fires an L2 rule every single day, so she is never `calm`. Confirmed
  programmatically by the backtest harness.

---

## 6. Assumptions I had to make

Listed because Phase 0's gate is a reviewer agreeing, and these are what to disagree with.

1. **The trace prefixes are a contract.** `fired:`, `unevaluable:` and `suppressed:` on `step:
   "evaluate"` rows are how anything downstream recovers per-rule outcome. They are string literals in
   `engine.py`, not enums. The backtest harness already pins them with a test; anything else that parses
   them must too.
2. **`warnings` are free prose and carry subject values.** `engine.py:106` interpolates
   `days_of_history`; `engine.py:113` interpolates `cycle_day`. Returning those to the subject's own
   device is the product working. Putting them in a log line or an error payload violates CLAUDE.md
   rule 5. There is no structured `code` on a warning; classification means prefix-matching prose.
3. **Deltas exist only as prose.** `"hrv_ms 22.0% below baseline (threshold 20.0%)"` lives in
   `fired_rules[].because`. There is no structured `{signal, delta_pct, threshold}` anywhere. Any UI
   wanting a ring or a sparkline has no machine-readable source, and inventing one in the API would be
   rule logic outside the engine.
4. **`as_of` is the only time in the system.** The engine never reads a clock. "Today" is whatever the
   snapshot says. Until persistence lands, `/decision/today` is aspirational.
5. **`elemental_layer_enabled` is optional in the schema but always present in practice** — `engine.py`
   emits it unconditionally.
6. **Determinism is proved, not assumed.** `tests/test_golden.py:158` asserts byte-identical
   `json.dumps(..., sort_keys=True)` across runs for every fixture. A content hash of a Decision is
   therefore a stable identifier.
7. **`schema_version` is `const: 1` in four places** — both schemas, `packages/shared-schema/src/index.ts`,
   `models.py`, and every persona fixture. It is not a version to bump casually.
8. **The TS projection is hand-written and narrower than the schema** in two places: `FiredRule.layer`
   (literal union vs `integer 1..5`) and `food.meals[].items`/`.removed` (typed vs bare `object`).
   `npm run generate` has never been run; `src/generated.ts` is not committed.

---

## 7. Known gaps pinned by fixtures

| Fixture | What it pins |
|---|---|
| **F5** | The James gap. RHR 26% over baseline fires nothing but L3 → "in balance today". Known defect, awaiting the rule 1.4 decision. |
| F5b | Candidate 1.4 would close it. `enabled: false`, strict xfail — it flips the day 1.4 is approved. |
| **F9** | Cross-layer precedence is real: an L5 block beats an L2 mandate. |
| **F11** | Layer separation is real, not a UI filter. Elemental off → only L1/L2/L5 fire. |
| F10 | The ginger collision is surfaced, not resolved. |
| F12 | Cold start degrades to `insufficient_baseline` rather than pretending. |
| F13 | `cycle_day > 28` is undefined; no L2 rule fires and the engine says so. |
| F14 | Missing signal → unevaluable, not false. |

If F9 or F11 goes red, arbitration is broken regardless of what else passes.
