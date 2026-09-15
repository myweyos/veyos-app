# Design history — Arbitration Engine & Rulebook

Backdated from git, ADRs and CI on 2026-09-14. Each row follows `../change-record-template.md`.
**"Review: none" is literal.** See `../README.md` Findings 1–2.

| Record | Change | Items | Requirement / design | Risk rows | Verification | Review |
|---|---|---|---|---|---|---|
| **LR-ENG-001** | `b7a4225` 2026-08-18, bootstrap: rulebook v1 (18 rules, 16 enabled), arbitration engine, golden fixtures F1–F15, JSON schemas | SI-1, SI-2, SI-3, SI-6 | ADR 0001 (monorepo), ADR 0003 (rules as config); `docs/engine.md` | R1–R4, R7, R9, R11–R15 | Golden suite. Pushed to `main`, so CI ran; the Contract job was **red from this commit** until `0cb27ed` | None (direct push) |
| **LR-ENG-002** | `bb48494` 2026-08-18, backtest harness; `c50a325` README | SI-4 | SCRUM-88: per-rule fire rates, co-firing, synthetic sweeps | R12 | 45 harness tests; CI smoke run added | None (direct push, no CI) |
| **LR-ENG-003** | `679c47d` 2026-08-25, decision-object contract summary | docs | Plan v1 Phase 0 | — | Reviewer gate named in the doc; **no reviewer recorded** | None |
| **LR-ENG-004** | `80dd719` 2026-08-25, rename `veyos_engine` → `weyos_engine` | SI-1 | Rename decision | — | Decisions for all personas captured before and after, and byte-identical: a mechanical change | None (direct push, no CI) |
| **LR-ENG-005** | `6c88e04` 2026-08-25, schema `$id` host moved | SI-6 | **ADR 0005**; `schema_version` stays 1 | — | Contract tests | None (direct push, no CI) |
| **LR-ENG-006** | `4233ac9`, `aafa776` 2026-08-26, personas moved to `packages/demo-fixtures`; Python demo driver; 3→6 app-state mapping as data | SI-3, test harness | Plan v1 Phase 2 | R2, R20 | `test_demo_fixtures.py` | None (direct push, no CI) |
| **LR-ENG-007** | `caf1d9a` 2026-09-01, engine sidecar at `services/engine-http` | SI-5 | **ADR 0004** (accepted); engine must stay pure | R21, R22 | 35 sidecar tests: schema validity, byte-identical pass-through, no leakage; AST purity test | None (direct push, no CI) |
| **LR-ENG-008** | PR **#8**, SCRUM-79: precedence for every layer pair, three-valued truth table, UNKNOWN end to end | SI-3, SI-5 tests | SCRUM-79 AC | R2, R7, R8 | Engine suite + sidecar 39/39 on the branch | **Open**, awaiting review |
| **LR-ENG-009** | PR **#9**, SCRUM-84: exactly one cycle phase per day, days 1–28 | SI-3 | SCRUM-84 AC1; AC2 = plan v2 §9.7, open | R3, R10 | 68 tests on the branch | **Open**, awaiting review |
| **LR-ENG-010** | PR **#17**, SCRUM-82: James's wrist temperature set to missing, as in the design pack; the James gap kept pinned as F19 and scenario day 7 | SI-3, test fixtures | Plan v2 §3 ("a test-data bug") | R1, R2 | Engine 138 passed / 3 xfail; sidecar, API and typecheck green on the branch | **Open**, awaiting review |

## Open items carried by this epic

- Every open spec question in CLAUDE.md and plan v2 §9 that touches the engine is pinned by a
  fixture rather than answered. The risk file lists which row each one sits behind.
- F16 (a lower block beats a higher mandate) is new, from LR-ENG-008.
- **Rulebook v1 has never been changed since bootstrap**, so no rulebook-change record exists yet.
  The first one will test the PR-template process.
