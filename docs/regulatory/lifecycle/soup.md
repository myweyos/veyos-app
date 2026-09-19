# SOUP — software of unknown provenance

Third-party runtime dependencies of the safety-relevant software items. Dev-only tools (pytest,
ruff, mypy, jest, eslint) are verification tooling and are listed only where they gate a release.

C1–C12 in the mitigation column are the risk controls defined in `../risk-file.md` §2.

Versions are the **declared ranges**. The lockfile (`package-lock.json`) pins the Node side;
**the Python side is not pinned** (see the open items).

| Item | SOUP | Declared | What it does for us | Failure that would matter | Mitigation |
|---|---|---|---|---|---|
| SI-1 Engine | PyYAML | `>=6.0` | Parses the rulebook | Mis-parse changes a threshold or tag | Rulebook validation is fatal on inconsistency (C6); golden fixtures (C3). Note that YAML 1.1 reads a bare `on` as `true` (found while writing `test_precedence.py`) |
| SI-1 Engine | Python stdlib | 3.11+ | Everything else | — | Engine purity test (C5) |
| SI-5 Sidecar | FastAPI | `>=0.115` | HTTP boundary | Default validation handler echoes input values, which would be a raw biometric in an error | Custom handler and leakage tests (C10) |
| SI-5 Sidecar | uvicorn[standard] | `>=0.30` | ASGI server | — | Health endpoint; API times out and returns 503, never a fabricated decision |
| SI-7 API | @nestjs/common, core, platform-express | `^10.4.0` | HTTP framework | — | API tests |
| SI-7 API | ajv, ajv-formats | `^8.17.1`, `^3.0.1` | Validates snapshots against the published schema | A schema accepted that shouldn't be | Same schema validated in Python on the other side; sidecar 400 → API 500 (loud) |
| SI-7 API | postgres | `^3.4.9` | Database driver | Lost or duplicated snapshot or decision | Repository tests; decisions keyed by content hash (ADR 0006) |
| SI-7 API | reflect-metadata, rxjs | `^0.2.2`, `^7.8.1` | Nest runtime | — | — |
| Verification | jsonschema | `>=4.21` | Contract tests in the engine | Format checks are not enforced (noted in `ci.yml`) | — |

## Open items

1. **Python dependencies aren't pinned.** `>=` ranges with no lockfile mean CI and production can
   resolve different versions of PyYAML and FastAPI on different days.
2. **No SOUP anomaly review** (known bugs in the versions we use) has been done. Add one at the
   first release.
3. **Mobile SOUP** (Expo SDK 51, React Native 0.74.5) is not listed yet. It renders the decision,
   and it becomes safety-relevant for notifications once the execution layer lands.
