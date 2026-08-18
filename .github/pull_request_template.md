## What and why

<!-- One paragraph. Link the Jira key. -->

## Rulebook impact

- [ ] No rulebook change
- [ ] Rulebook changed — thresholds/priorities edited in `config/rules/`
  - [ ] Backtest run and result linked below
  - [ ] Golden fixture added or updated
  - [ ] Rulebook version bumped if any existing fixture's expected output changed

## Contract impact

- [ ] No change to `packages/shared-schema`
- [ ] Schema changed — ADR added in `docs/adr/`, TS types regenerated, engine contract tests pass

## Checks

- [ ] `make engine-test` green (F9 and F11 in particular)
- [ ] No raw biometric values in logs, error messages or trace strings
- [ ] No rule logic added outside `services/engine`
- [ ] Open spec questions in CLAUDE.md were not silently resolved in code

## Notes for review

<!-- Anything you guessed at, anything you want a second opinion on. Say so here rather
     than letting it ship quietly — this codebase produces health-adjacent advice. -->
