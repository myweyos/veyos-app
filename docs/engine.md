# The arbitration engine

## What it is

`(SignalSnapshot, Rulebook) -> Decision`. Pure. Deterministic. 16 rules across 5 layers,
all expressed as data in `config/rules/rules.v1.yaml`.

## Precedence

```
Layer 1 (biometric)  >  Layer 5 (labs)  >  Layer 2 (hormonal)  >  Layer 3 (constitution)  >  Layer 4 (environment)
   safety                diagnosed           cyclical               persistent               modifier
```

Lower `priority` number wins. Priorities are unique across the whole rulebook — duplicates
are a fatal load error, because they would make arbitration depend on YAML ordering.

## Three-valued evaluation

A condition is TRUE, FALSE or **UNKNOWN**, and UNKNOWN is not FALSE. Missing HRV means "we
cannot say whether this person is in sympathetic overload", which is a different product
state from "they are not". Rules containing an UNKNOWN condition do not fire, and the
decision carries a warning so the client can say "still learning your baseline" instead of
"you're in balance today".

This distinction is the difference between a system that is honest about its blind spots and
one that reassures people it has no basis to reassure.

## Activity resolution

Most restrictive fired rule wins: `rest > substitute > downgrade > relocate > allow`.
Ties break by precedence. A `relocate` from a lower-precedence rule still applies to whatever
survived above it — a rest day is still an indoor rest day.

## Food resolution

Build-then-filter, least authoritative layer first, so the most authoritative layer gets the
last word:

```
planned meals → L4 modifiers → L3 dosha → L2 hormonal → L5 labs → L1 biometric
```

- **Blocks remove items** and every removal records the rule id that caused it.
- **A block withdraws a mandate** from a less authoritative layer. This is fixture F9:
  luteal mandates complex carbs, an elevated HbA1c blocks them, the carbs lose.
- **L1 additions land last**, in a separate `additions` slot so the user can see the engine
  put something on their plate.
- When an L1 addition carries a tag a lower layer blocked, the item stays (precedence) and
  the engine emits a **warning**. That is the ginger-for-a-Pitta case: correct per spec,
  reads badly in the UI, unresolved by design rather than by omission.

## Calm state

If only the always-on Layer 3 baseline fired, the state is `calm` — "in balance today", no
intervention. See the caveat in the next section before trusting that.

## Known gaps pinned by fixtures

| Fixture | What it pins |
|---|---|
| **F5** | **The James gap.** RHR 26% above baseline with no temperature rise fires nothing but L3, so the app says "in balance today". Known product defect, awaiting a rule decision. |
| F5b | Candidate rule 1.4 (Cardiovascular Load) would close it. `enabled: false`, xfail. |
| **F9** | **Cross-layer precedence is real.** L5 block beats L2 mandate. |
| **F11** | **Layer separation is real.** Elemental layer off → only L1/L2/L5 fire. |
| F10 | Ginger-for-a-Pitta collision is surfaced, not silently resolved. |
| F12 | Cold start degrades to `insufficient_baseline` rather than pretending. |
| F13 | `cycle_day > 28` is undefined; no L2 rule fires and the engine says so. |
| F14 | Missing signal → unevaluable, not false. |

Also unresolved: percentage vs z-score comparison (rulebook says one, the patent recites the
other — both are implemented, the choice is a backtest decision), and whether rule 1.2 reads
sleep *stage* percentages or a vendor composite score.

## Running it

```bash
make decision PERSONA=alex STATE=crash
make decision-validated
cd services/engine && pytest -v
```
