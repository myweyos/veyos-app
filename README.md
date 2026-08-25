# Weyos

Monorepo for the Weyos MVP: a native mobile app that reads live biometric signals,
arbitrates them through a config-driven rules engine, and issues a single coherent
daily intervention (activity, food, supplements).

**Status:** pre-alpha. MVP scope is locked (~760h with contingency, 2 builders, ~16 weeks).
Not a medical device. Wellness-positioned in both UK and US.

## Layout

```
apps/mobile              Expo (React Native) client. EAS dev builds, not Expo Go.
services/api             Ingestion + orchestration API (NestJS, TypeScript).
services/engine          Arbitration engine (Python). Config-driven, deterministic, no ML.
services/engine/backtest Backtest harness. Runs the rulebook over a corpus and reports
                         per-rule fire rates and co-firing. Measures; never edits rules.
packages/shared-schema   THE contract. Canonical normalised signal schema.
                         JSON Schema is the source of truth; TS + Pydantic are generated.
config/rules             Versioned rulebook (rules.v1.yaml). Change a threshold here,
                         not in code. Every change needs a backtest + a fixture.
docs/                    Architecture, ADRs, engine deep dive.
```

## The one rule that matters

**`packages/shared-schema` is the only thing three services agree on.** Mobile, API and
engine never import each other. They import the contract. If you need to change the
contract, that is an ADR + a version bump, not a quiet edit.

## Quick start

```bash
make setup          # install everything
make test           # run all test suites
make engine-test    # golden fixtures only — this is the suite that must never go red
make dev            # docker-compose up postgres/timescale + redis, then api in watch mode
```

## Engine first

The arbitration engine is the product. It is pure, deterministic and has no I/O — it takes a
`SignalSnapshot` and returns a `Decision` with a full trace of which rules fired and why.
That property is deliberate: it makes the 16 rules testable without a phone, a wearable, or
a backend. Keep it that way.

```bash
cd services/engine
pytest -q                       # all fixtures
pytest -q -k "F9 or F11"        # the two fixtures worth protecting above all others
python -m weyos_engine.cli --persona sarah --state crash   # human-readable decision trace
```

## Backtesting a rulebook change

Changing a threshold requires a backtest. There is a harness for it:

```bash
make backtest                   # synthetic sweep, per-rule fire rates + co-firing
make backtest GRID=quick        # ~2.9k snapshots instead of ~69k
make backtest-validated         # validated-biometrics-only mode (L1/L2/L5)

cd services/engine
python -m backtest run --snapshots ./corpus --validate --json out.json
```

It drives the real `decide()`, never edits `config/rules/`, and never enables a disabled
rule — proposed rules report **null** rates rather than a misleading 0%. JSON output carries
no wall-clock, so two runs diff clean and a rulebook change is the only thing that shows.

Two things to internalise before quoting a number out of it: a fire rate over the synthetic
sweep is **coverage of the input space, not incidence** — the grid is uniform over parameter
space, real subjects are not — and every run ends with the open spec questions it touched,
raised rather than resolved. See `services/engine/backtest/README.md`.

## Compliance guardrails (read before writing code that touches user data)

- No raw biometric data in logs, ever. Log rule IDs and deltas, not values tied to a user.
- Layer 4 (elemental/astro) sits behind `features.elemental_layer`, default ON in product,
  and must be provably separable — see fixture F11. Do not let it leak into L1/L2/L5 paths.
- UK GDPR Art.9 special-category data. Consent is granular and per-signal-class.
- See `docs/compliance.md` before adding any new signal source.

## Docs

- `docs/architecture.md` — components and data flow
- `docs/engine.md` — the 16 rules, precedence, resolution algorithms
- `services/engine/backtest/README.md` — the backtest harness, and how to read its numbers
  without misusing them
- `docs/adr/` — decisions with dates and consequences
- `CLAUDE.md` — conventions for AI-assisted work in this repo
