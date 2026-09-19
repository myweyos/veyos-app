# Software lifecycle records — IEC 62304

| | |
|---|---|
| **Status** | **DRAFT — adopted 2026-09-14, backdated to the first commit (2026-08-18)** |
| **Ticket** | SCRUM-132 |
| **Related** | Intended purpose: `../intended-purpose.md` (SCRUM-121). Risk file: `../risk-file.md` (SCRUM-133) |

Weyos is positioned as wellness, not a medical device. These records are kept anyway, from now
on and backdated, so that if classification ever tips toward a regulated pathway, the history is
already written down and doesn't have to be reconstructed from memory.

The aim is to be lightweight. IEC 62304 asks for evidence of a process, not for paperwork for its
own sake. Most of that evidence already exists in git, pull requests, CI runs, ADRs and golden
fixtures. These records **point at** that evidence and name the gaps. They don't copy it out.

## Software safety classification

**Not assigned.** A class depends on the intended purpose and the risk analysis, and both are
drafts awaiting review. Working assumption, for counsel to confirm or overturn: records are kept
at the level of detail **Class B** would require, so nothing has to be reconstructed if that's
where it lands. That is a record-keeping choice, not a classification.

## What's here

| File | 62304 clause | Purpose |
|---|---|---|
| `README.md` (this file) | 5.1 development plan, 8 configuration management, 9 problem resolution | The process |
| `change-record-template.md` | 5.x, 6 maintenance | What a change record contains |
| `records/arbitration-engine.md` | 5.1–5.8 | Retroactive design history, Arbitration Engine & Rulebook epic |
| `records/backend.md` | 5.1–5.8 | Retroactive design history, Backend & Data Platform epic |
| `soup.md` | 5.3.3, 7.1.2, 8.1.2 | Third-party software the safety-relevant items depend on |

## Software items

| Item | Path | Safety-relevant because |
|---|---|---|
| SI-1 Engine | `services/engine/weyos_engine` | Makes every health judgement (CLAUDE.md non-negotiable 7) |
| SI-2 Rulebook | `config/rules/` | The thresholds, priorities, blocks and mandates. It's config, but it's the logic |
| SI-3 Golden fixtures and engine tests | `services/engine/tests/` | The regression net; the verification evidence for SI-1/SI-2 |
| SI-4 Backtest harness | `services/engine/backtest/` | Evidence for threshold choices |
| SI-5 Engine sidecar | `services/engine-http/` | Carries the decision; must add nothing to it (ADR 0004, 0006) |
| SI-6 Shared schema | `packages/shared-schema/` | The contract between every item |
| SI-7 API | `services/api/` | Ingestion, normalisation, baselines, storage, serving |
| SI-8 Mobile app | `apps/mobile/` | Renders the decision to the user |

## The process from here on (AC2)

**For new work, the pull request is the change record.** It must fill in the PR template, which
now covers rulebook impact, contract impact, risk-file review and lifecycle. It must reference a
Jira key and pass CI. Nothing else needs writing per PR.

1. **Branch** `feat/SCRUM-NN-slug` from `development`. No direct pushes (§ Findings, 1–2).
2. **PR** into `development`, with the template filled in. It must name the software items touched,
   the risk-file rows affected (or "none"), and the verification: which tests, and CI green.
3. **Review.** At least one approving review from someone other than the author before merge.
   This needs branch protection to enforce it; today it isn't enforced (Findings, 1).
4. **Rulebook or contract change:** a fixture, a backtest and an ADR as the PR template already
   requires, **plus** a risk-file review.
5. **Release.** A merge to `main` is a release. Each release gets a record listing the PRs it
   contains, the rulebook version and the schema version, filed under `records/releases/`. There
   has been no release yet; `main` is still at the bootstrap commit.
6. **Problem resolution.** A defect found in a safety-relevant item is a Jira Bug linked to the risk
   file row it affects. A known-wrong behaviour that is kept on purpose is pinned by a golden
   fixture with a strict xfail, as with F5/F5b and F16/F16b.
7. **Quarterly:** bring the epic records up to date alongside the risk-file review.

## Findings from backdating

These are gaps in the history as it stands. They're recorded so they can't be forgotten; none is
fixed by this change.

1. **No change to date has had an approving review.** PRs #1–#5 were each merged by their author
   with zero reviews. Everything before them was pushed directly.
2. **Direct pushes to `development` ran no CI.** CI triggers on pull requests and on pushes to
   `main` only. About twenty commits, including the whole engine sidecar and the API serving
   path, reached `development` with no CI run. PRs #1–#5 were green on every job.
3. **Two ADRs are numbered 0007:** `0007-schema-versioning-and-ts-generation.md` and
   `0007-storage-model-and-data-residency.md`. Anything citing "ADR 0007" is ambiguous until
   one is renumbered. **In review: PR #15 moves storage to 0008.**
4. **The plan that governs the build was committed without a message.** `f1ca6a7` ("Plan commit")
   added `docs/build-plan-v2-direct-to-product.md` and the CLAUDE.md change that supersedes the
   earlier plan. `f1d7d5a` is titled "commit".
5. **Neither `main` nor `development` is protected.** Findings 1 and 2 follow from this.
6. **There have been no releases,** so there are no release records to backdate.
