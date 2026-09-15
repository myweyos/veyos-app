# Design history — Backend & Data Platform

Backdated from git, ADRs, PRs and CI on 2026-09-14. Each row follows `../change-record-template.md`.
**"Review: none" is literal.** See `../README.md` Findings 1–2.

| Record | Change | Items | Requirement / design | Risk rows | Verification | Review |
|---|---|---|---|---|---|---|
| **LR-BE-001** | `5bdd0f6` 2026-09-02, API serves decisions from the engine; decision envelope schema; engine client | SI-7, SI-6 | **ADR 0006** (content-hash decision id, envelope, no `ui_state`); ADR 0004 transport | R20, R22 | API test suite (first in the repo) | None (direct push, no CI) |
| **LR-BE-002** | `a9ae263` 2026-09-02, untrack a stray compiled `index.js` in shared-schema | SI-6 | Housekeeping | — | — | None (direct push, no CI) |
| **LR-BE-003** | PR **#3** (`1b7f4cf`) 2026-09-10, SCRUM-24: schema versioning, generated TS types, breaking-change check | SI-6 | **ADR 0007 (schema versioning)**. **Contract change:** `signal-snapshot.schema.json` +293/−64 and `decision.schema.json` +29/−3; package 1.0.0 → 1.1.0 (minor, so classified non-breaking) | — | `check-breaking.test.js`; generation-sync CI step; CI green on every job | **None.** Merged by author, 0 reviews |
| **LR-BE-004** | PR **#4** (`ab380c2`, `792ecde`, `5f28fce`, `0f06556`, `6a185cd`) 2026-09-11, SCRUM-72: TimescaleDB migrations, retention policies, snapshot and decision repositories, DB health check | SI-7 | **ADR 0007 (storage model and data residency)**, which has the **same number as LR-BE-003's ADR** | R6 (`collected_on` now stored, still unread by the engine), R20 (`personas.source.spec.ts` pins the demo default **on**), R22 | Repository, migration and health specs; CI green on every job | **None.** Merged by author, 0 reviews |
| **LR-BE-005** | PR **#5** (`afae164`) 2026-09-11, SCRUM-71: canonical normalisation of vendor shapes; baseline computation service | SI-7 | SCRUM-71 AC | R4, R5 (the baseline is computed here, outside the engine, and feeds every baseline-relative rule) | Normalisation and baseline specs; CI green on every job | **None.** Merged by author, 0 reviews |

## Also merged, other epics (not recorded in detail here)

| Change | Epic | Review |
|---|---|---|
| PR #1 (`24926ea`, `324a770`), SCRUM-21: CI configuration | Foundations & Platform | None, 0 reviews |
| PR #2 (`089be8d`, `4f301bc`), SCRUM-20: service-boundary checker | Foundations & Platform | None, 0 reviews. SCRUM-20 is marked Done in Jira, but `main` is not protected |
| `0cb27ed`: repaired three failures in the Contract CI job, red since bootstrap | Foundations & Platform | None (direct push) |

## Open items carried by this epic

- **ADR 0007 is used twice.** One needs renumbering.
- **Baseline computation (LR-BE-005) is safety-relevant** even though it sits outside the engine.
  Every baseline-relative rule depends on its output. It needs its own fixtures in the same
  spirit as the golden set, and a risk-file review.
- **The demo default (R20)** went in with LR-BE-001 and is pinned by a spec in LR-BE-004.
