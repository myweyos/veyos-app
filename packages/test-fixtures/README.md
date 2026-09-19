# @weyos/test-fixtures

Synthetic `SignalSnapshot`s for automated tests: the engine's golden fixtures, the sidecar
tests and the API tests. **Test data only.** Nothing in the app or the API may read these at
runtime (CLAUDE.md non-negotiable 9).

Each file in `snapshots/` is a complete, schema-valid snapshot with every biometric at its
baseline, named for the traits it exercises:

| Base | Constitution | Cycle | Environment |
|---|---|---|---|
| `vata-cycling.json` | vata | tracked, day 20 (luteal) | 17 °C |
| `kapha-no-cycle.json` | kapha | none | 19 °C |
| `pitta-heat.json` | pitta | none | 30 °C (heat-wave rule 4.2) |

A test states what it's about by deep-merging overrides onto a base: a low HRV, a missing
signal, a cycle day, a lab value. See `services/engine/tests/fixtures/golden.yaml`.

All values are simulated. Never commit real subject data here or anywhere else in the repo.
