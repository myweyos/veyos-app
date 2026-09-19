# ADR 0010 — Baseline comparison mode: percent or z-score

Date: 2026-09-16
Status: **Proposed — DRAFT for JB.** The decision is plan v2 §9.6 and belongs to the rulebook
owner. This ADR supplies the evidence the ticket (SCRUM-74) asked for; it does not pick.
Implements: SCRUM-74 (evidence half)

## Context

Rulebook v1 writes every baseline-relative condition as a percentage of the subject's own
trailing mean ("HRV 20% below baseline"). The patent recites a z-score:
`(current − trailing MA) ÷ historical SD`. The engine implements both behind
`baseline.comparison_mode`, but until now no condition carried a `value_z`, so the z-score mode
fell back to percent on every condition and no backtest could tell them apart.

## What was added to make the question answerable

1. **Candidate z-score thresholds**, in `config/rules/proposals/value_z.candidates.yaml`. They
   are chosen to coincide with the percent thresholds for a subject at the variability the test
   snapshots use (HRV SD 10% of baseline, RHR SD 5%):

   | Rule | Percent form | Candidate z | Why |
   |---|---|---|---|
   | 1.1 | HRV ≥ 20% below baseline | 2.0 SD below | 20% ÷ 10% |
   | 1.3 | RHR ≥ 5% above baseline | 1.0 SD above | 5% ÷ 5% |
   | 1.4 (disabled) | RHR ≥ 15% above | 3.0 SD above | 15% ÷ 5% |

   Rule 1.2 (`sleep_deep_rem_pct`) cannot take a z-score: the snapshot schema carries no SD
   for it. It stays percent in both modes.

2. **A `variability` axis** in the synthetic sweep (`stock`, `steady`, `variable`), because the
   two forms only diverge when a subject's SD-to-baseline ratio departs from stock.

3. **`python -m backtest compare`**, which runs a corpus through both modes and reports, per
   rule, how often they agree and which way they disagree.

The rulebook file is untouched. The proposal is overlaid in memory with `--value-z`.

## Evidence

```
python -m backtest compare --synthetic --grid boundary \
    --axis variability=stock,steady,variable \
    --value-z ../../config/rules/proposals/value_z.candidates.yaml
```

207,360 synthetic snapshots (the boundary grid × three variability profiles):

| Rule | Both fired | Neither | Percent only | Z-score only | Agreement |
|---|---|---|---|---|---|
| 1.1 | 69,120 | 86,400 | 34,560 (all *variable*) | 17,280 (all *steady*) | 75.0% |
| 1.2 | 103,680 | 103,680 | 0 | 0 | 100% (no SD; percent in both) |
| 1.3 | 92,160 | 103,680 | 11,520 (all *variable*) | 0 | 94.4% |
| 1.4 | 0 | 207,360 | 0 | 0 | disabled |

- **Engine state changed** on 312 snapshots (0.15%).
- **Activity verdict changed** on 37,440 snapshots (**18.1%**). This is the number a user would
  notice: whether tonight's session is substituted or left alone.
- At `stock` variability: **zero** disagreements, as designed. Every disagreement is a subject
  whose own history is narrower or wider than stock.

Read plainly:

- For a **steady** subject (SD = 5% of baseline), a 10% HRV drop is two of *their* standard
  deviations. The z-score form fires 1.1; the percent form waits for 20%.
- For a **variable** subject (SD = 20%), a 20% HRV drop is one of *their* standard deviations,
  an ordinary day. The percent form fires 1.1; the z-score form does not. The same for 1.3 on RHR.

So the question is not which threshold is right but whether "20% below baseline" means the
same thing for everyone. The percent form says yes. The z-score form says a drop is measured
against the subject's own noise.

## Limits of this evidence

- The synthetic grid straddles the **percent** thresholds (80%, 105%), not the z-score ones, so
  it under-counts z-only firings where the grid has no point between the two boundaries (that
  is why 1.3 shows no z-only firings at `steady`: nothing sits between 100% and 105%).
- No recorded signal history has been run. The 14-day rolling SD on real wearable data is noisier
  than a fixed coefficient of variation; with 14 points, the SD estimate itself moves a lot.
- The candidate thresholds are derived arithmetically from the percent ones. Nobody has said 2.0
  SD is the right number for rule 1.1; only that it agrees with 20% at stock variability.

## Options

1. **Stay on percent** (the rulebook as written). Simple, explainable ("20% below your usual"),
   but treats a naturally variable subject and a steady one identically, and the patent recites
   the other form.
2. **Switch to z-score** with these candidates. Matches the patent and the subject's own noise,
   but the first month of a subject's history gives a poor SD, and "2.1 standard deviations
   below your usual" is harder copy than a percentage. Requires SDs in the baseline for every
   signal a rule reads (1.2 has none: a contract change).
3. **Percent with a variability guard**: keep percent, but treat a subject whose SD exceeds some
   ratio differently. This is a new rule form and needs its own spec.

## Decision

Not taken. JB to decide, then:

- if z-score: move the proposal into `rules.v1.yaml` as `value_z` (a rulebook change: fixtures per
  rule, backtest, version bump), set `comparison_mode: zscore`, add `sleep_deep_rem_sd` to the
  baseline schema (ADR) or accept 1.2 stays percent;
- if percent: delete the proposal file, and record here that the patent's form was considered
  and rejected for the MVP with the reasons above;
- either way, re-run `compare` on recorded history once 90 days of real data exist, before the
  choice is treated as final.
