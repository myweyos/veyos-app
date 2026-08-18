# Architecture

## Data flow

```
Expo client ──(1)──> Ingestion API ──(2)──> normalisation ──(3)──> time-series store
    │                     │                                            │
    │                     └──(4)──> arbitration engine <───────────────┘
    │                                    │
    └──(6)── APNs/FCM <──(5)── execution layer (exactly-once, state machine)
```

1. Client computes on-device baselines and cheap local variance detection. It opens the
   high-frequency stream **only when a variance trip fires** — battery, cost, and a privacy
   posture in one decision.
2. Every payload validates against `signal-snapshot.schema.json` at the boundary, before
   storage. Invalid in, 400 out.
3. One canonical normalised schema. Vendor shapes (HealthKit, Health Connect, BLE) die at
   the normalisation layer and never appear downstream.
4. Engine is pure: `(Snapshot, Rulebook) -> Decision`. No I/O, no clock, no randomness.
5. Execution layer owns delivery semantics: exactly-once, state machine, no duplicate
   notifications when the same snapshot is reprocessed.
6. Push only. There is no web client in the MVP.

## Why the engine is pure

It is the only way to test 16 interacting rules across 3 personas × N signal combinations
without a phone, a wearable, a backend or a human. It also means a decision can be
reproduced exactly from a stored snapshot plus a rulebook version — which is what
"explainable" has to mean when a regulator asks.

Consequence: nothing in `services/engine` may import a network, database or time library.
CI enforces the spirit of this; reviewers enforce the letter.

## Real-time is BLE only

Apple Watch does not stream in real time. A BLE chest strap is the only real-time source in
the MVP. Anyone promising live Apple Watch data is describing a different product. This is a
managed expectation, not a bug to fix.

## Managed-first infrastructure

Managed Postgres + TimescaleDB, managed Redis, container runtime (App Runner/Fargate or
Fly.io to start). Boring and portable beats clever and cheap at this stage: a two-person team
cannot also run infrastructure.

## Multi-region

UK and US from day one, with data residency and routing per region. UK is the primary
go-to-market. This is a compliance requirement, not an optimisation — see `compliance.md`.

## Deliberately deferred

Companion web app (~154h), employer/insurer dashboards, real calendar/grocery/GP
integrations, two-way messaging, deeper AI. Parked, not lost.
