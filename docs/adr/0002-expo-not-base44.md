# ADR 0002 — Expo (React Native) for the real client; the Base44 prototype is not the product

Date: 2026-08-18
Status: Accepted

## Context

A Base44 prototype exists and implements the rulebook as a live rules engine with simulated
inputs. It is a demo of the logic, not a shippable client: the MVP needs HealthKit, Health
Connect, BLE and background tasks.

## Decision

Real native MVP on Expo (React Native), with native sensor modules via the Expo Modules API
and config plugins, shipped through EAS development builds. Not Expo Go — it ships a fixed
native runtime and cannot load those modules.

The prototype is retained as a demo asset. Its content is not ported: it drifted from spec
(a "warming indoor Vinyasa" offered where L1 mandates a parasympathetic substitute; a meal
labelled cooling that names a warming stew). `config/rules/rules.v1.yaml` and `docs/engine.md`
are the source of truth.

## Consequences

- Apple Developer Program enrolment, Play Console setup and HealthKit entitlements are
  day-one calendar items — they gate physical-device builds and take weeks, not hours.
- The first meaningful mobile milestone is a dev build reading one real HealthKit value on a
  physical device, not a screen.
