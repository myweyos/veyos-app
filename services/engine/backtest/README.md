# Rulebook backtest harness

Runs the **existing** rulebook over a corpus of snapshots and reports, per rule, how often it
fired and which other rules it fired alongside.

```bash
cd services/engine

python -m backtest run --synthetic                    # sweep in memory, print the report
python -m backtest run --snapshots ./corpus --json out.json
python -m backtest generate --out ./corpus --grid quick
```

Or via make, from the repo root:

```bash
make backtest              # default grid
make backtest GRID=quick
make backtest-validated    # validated-biometrics-only mode
```

## What it will not do

- **It does not change `config/rules/rules.v1.yaml`.** Nothing in here writes to `config/`;
  `test_the_rulebook_is_never_written_to` asserts it.
- **It does not enable disabled rules.** 1.4 (Cardiovascular Load) and 4.4 (Air Quality) stay
  off and are reported as `status=disabled` with **null** rates — not a measured 0%. A disabled
  rule has not been shown to never fire; it has not been asked.
- **It does not resolve the open spec questions in CLAUDE.md.** It reports what a run observed
  about each and stops. See the `OPEN SPEC QUESTIONS` section at the bottom of every report.

## Reading a number out of this thing

> A fire rate over the synthetic sweep is **coverage of the input space, not incidence in a
> population.**

The grid is uniform over parameter space. Real subjects sit near their own baseline most days,
so the two are not remotely the same. "Rule 1.1 fires on 50% of snapshots" means *half the grid
points cross its threshold*, which is a fact about the grid. It is not "half of days". Quoting
it as a frequency is the single easiest way to misuse this tool.

Four more things the report repeats every run:

- **Cross-section, not time series.** Every snapshot is independent and shares one `as_of`.
  Nothing here measures persistence, streaks or day-over-day behaviour.
- **Cohort composition is an artefact of the axes.** The share of non-cycling subjects, the
  dosha mix and the lab profiles were chosen by the grid and move every rate that depends on them.
- **Two denominators, neither endorsed.** `rate` is over all snapshots; `eval-rate` is over
  snapshots where the rule actually resolved TRUE or FALSE. They diverge hard wherever a signal
  is structurally absent — L5 with no labs, L2 for a subject with no cycle.
- **Layer 4 rules cannot co-fire in the stock grids.** Environment is swept as one-hot named
  profiles, so 4.1+4.2 reads as mutually exclusive when a heat-wave can obviously land on a full
  moon. That exclusivity is an artefact of this generator. Use
  `--axis env_profile=heatwave_full_moon` to show L4 rules co-firing normally.

## Metrics

| Column | Meaning |
|---|---|
| `fired` | snapshots where the rule fired |
| `rate` | `fired / all snapshots` |
| `eval-rate` | `fired / snapshots where the rule resolved TRUE-or-FALSE` |
| `unevaluable` | snapshots where a condition was UNKNOWN (three-valued logic; UNKNOWN is not FALSE) |

Co-firing is reported three ways, because "frequency" is ambiguous:

- **count** — snapshots where both fired
- **P(b\|a)** — asymmetric; the one you want when hunting for a rule subsumed by another
- **jaccard** — symmetric overlap

Plus the invariants the rulebook claims about itself: Layer 2 "exactly one fires", Layer 3
one-dosha-per-subject, and Layer 3 always firing.

## The synthetic generator

A **deterministic cartesian sweep** — no clock, no RNG. Same axes in, byte-identical corpus out,
in a fixed order, which is what makes `--limit` a stable prefix and lets you diff two backtests
and attribute the difference to the rulebook rather than to luck.

Axis values hug the rulebook's thresholds. For every numeric threshold the default grid includes
a point exactly on it and a point one step the other side, so the corpus *proves* which way an
inclusive `gte` and an exclusive `lt` resolve rather than assuming:

| Rule | Threshold | Straddled by |
|---|---|---|
| 1.1 | `hrv pct_below_baseline_gte 20` | 80% of baseline fires, 81% does not |
| 1.2 | `sleep pct_of_baseline_lt 60` | 59% fires, 60% does **not** |
| 1.3 | `temp >= 0.5` **and** `rhr pct_above_baseline_gte 5` | 0.5 / 105% fire, 0.0 / 100% do not |
| 4.2 | `ambient_temp_c > 25` | `mild` (18 °C) vs `heatwave` (30 °C) |

Grids: `quick` (2,880 — CI), `boundary` (69,120 — default, ~10s), `fine` (adds interior points
and a null sleep reading).

Override any axis without touching a preset:

```bash
python -m backtest run --synthetic --axis cycle_day=none,29,31   # the undefined cycle region
python -m backtest run --synthetic --axis env_profile=heatwave_full_moon
python -m backtest run --synthetic --axis sleep_pct_of_baseline=none  # rule 1.2 unevaluable
```

Axes: `dosha`, `hrv_pct_of_baseline`, `rhr_pct_of_baseline`, `sleep_pct_of_baseline`,
`wrist_temp_delta_c`, `cycle_day`, `env_profile`, `lab_profile`. Percent axes are percent *of the
subject's own baseline*, which is the form the rulebook is written in.

## Coupling to the engine

The harness drives the real `decide()` rather than re-implementing the enabled/suppressed gating,
and recovers per-rule outcome from the decision the engine already returns — `fired_rules` plus
the trace prefixes `fired:` / `unevaluable:` / `suppressed:`.

Those prefixes are a coupling. `tests/test_backtest.py::test_trace_prefixes_still_match_the_engine`
pins them, so if the engine restyles its trace the harness fails loudly instead of quietly
reporting that nothing was ever unevaluable.

## Privacy

CLAUDE.md rule 5 (no raw biometrics in logs or error messages) applies here too. The report emits
rule ids, counts and rates. Engine warnings are counted **by category** and the raw strings are
never reprinted, because they interpolate subject values. Load errors carry a JSON path, a field
name or an exception class — never a value.

## Output

Text by default. `--json out.json` additionally writes a machine-readable report carrying no
wall-clock and no host detail, so two runs of the same corpus against the same rulebook are
byte-identical and `diff` across a proposed rule change shows the effect of the change and
nothing else.
