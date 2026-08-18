# Compliance guardrails for engineers

Not legal advice, and not a substitute for the DPIA. This is the set of constraints that
change how you write code day to day.

## Positioning

Wellness, **not a medical device**, in both markets, for the MVP. That has teeth in code:

- No output may diagnose, treat, or claim to prevent a condition. Rule messages are
  behavioural ("today is for recovery"), never clinical ("you have an infection").
- Copy changes to intervention messages are a compliance surface. Route them past legal,
  not just design.
- If a rule's output starts reading like a diagnosis, that is a spec issue, not a wording
  problem.

## Data

- Biometric and health data is **Art.9 special-category** under UK GDPR. Everything follows:
  granular per-signal-class consent, purpose limitation, retention limits, encryption at
  rest and in transit, and an audit trail.
- `subject_ref` is pseudonymous and is the only key biometric data is stored against.
- No raw biometric values in logs, error payloads, exception messages, crash reports or
  analytics events. Rule ids, deltas and booleans only.
- No real subject data in the repo, in fixtures, in CI, or in local docker.

## US specifics

- Wellness (non-device) positioning is legal-reviewed to avoid FDA claims.
- CCPA/CPRA plus consumer-health-data laws (e.g. Washington My Health My Data) — consent and
  deletion paths are product features, not admin tasks.
- Stay out of HIPAA scope. That means no provider integrations in the MVP.

## Out of scope for the MVP

NHS/FHIR/DSPT, MHRA/UKCA certification, NHS DTAC/DCB0129/0160, NIHR pilot, virtual GP
service. These run on a separate regulatory track and must not leak into MVP scope.

## The elemental layer

Layer 3/4 (dosha, moon phase, season) is always-on in product but must be **provably
separable**: with the flag off, decisions derive solely from L1/L2/L5. Fixture F11 is the
proof. This exists so a clinical, regulatory or investor audience can be shown a
validated-biometrics-only mode that is real rather than cosmetic. Do not couple these layers.
