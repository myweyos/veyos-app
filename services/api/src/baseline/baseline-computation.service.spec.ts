import { Test } from "@nestjs/testing";
import type { SignalSnapshot } from "@weyos/shared-schema";

import { SignalSnapshotRepository } from "../store/signal-snapshot.repository";
import { BaselineComputationService } from "./baseline-computation.service";

type HistoryRow = { hrv_ms: number | null; rhr_bpm: number | null; sleep_deep_rem_pct: number | null };

function makeRepo(rows: HistoryRow[] = []): jest.Mocked<SignalSnapshotRepository> {
  return {
    biometricHistoryForSubject: jest.fn().mockResolvedValue(rows),
    latestForSubject: jest.fn(),
    upsert: jest.fn(),
  } as unknown as jest.Mocked<SignalSnapshotRepository>;
}

async function buildService(rows: HistoryRow[] = []) {
  const repo = makeRepo(rows);
  const module = await Test.createTestingModule({
    providers: [
      BaselineComputationService,
      { provide: SignalSnapshotRepository, useValue: repo },
    ],
  }).compile();
  return { service: module.get(BaselineComputationService), repo };
}

const SUBJECT = "sub_test12345678";
const AS_OF = "2026-09-11";

describe("BaselineComputationService — Option B (server-side)", () => {
  it("computes correct rolling means from 14 days of complete data", async () => {
    const rows: HistoryRow[] = Array.from({ length: 14 }, (_, i) => ({
      hrv_ms: 50 + i,
      rhr_bpm: 60 - i,
      sleep_deep_rem_pct: 30 + i,
    }));
    const { service } = await buildService(rows);
    const result = await service.computeFor(SUBJECT, AS_OF);

    // mean of 50..63 = 56.5
    expect(result?.hrv_ms).toBeCloseTo(56.5);
    // mean of 60..47 = 53.5
    expect(result?.rhr_bpm).toBeCloseTo(53.5);
    // mean of 30..43 = 36.5
    expect(result?.sleep_deep_rem_pct).toBeCloseTo(36.5);
    expect(result?.days_of_history).toBe(14);
    expect(result?.window_days).toBe(14);
  });

  it("excludes null values from mean (e.g. days without sleep data)", async () => {
    const rows: HistoryRow[] = [
      { hrv_ms: 50, rhr_bpm: 60, sleep_deep_rem_pct: null },
      { hrv_ms: 60, rhr_bpm: 70, sleep_deep_rem_pct: null },
      { hrv_ms: null, rhr_bpm: 65, sleep_deep_rem_pct: 35 },
    ];
    const { service } = await buildService(rows);
    const result = await service.computeFor(SUBJECT, AS_OF);

    // mean of [50, 60] ignoring null → 55
    expect(result?.hrv_ms).toBeCloseTo(55);
    // mean of [60, 70, 65] → 65
    expect(result?.rhr_bpm).toBeCloseTo(65);
    // mean of [35] → 35
    expect(result?.sleep_deep_rem_pct).toBeCloseTo(35);
    expect(result?.days_of_history).toBe(3);
  });

  it("returns null for a metric when ALL rows have null for it", async () => {
    const rows: HistoryRow[] = [
      { hrv_ms: 50, rhr_bpm: 60, sleep_deep_rem_pct: null },
      { hrv_ms: 55, rhr_bpm: 65, sleep_deep_rem_pct: null },
    ];
    const { service } = await buildService(rows);
    const result = await service.computeFor(SUBJECT, AS_OF);

    expect(result?.sleep_deep_rem_pct).toBeNull();
  });
});

describe("BaselineComputationService — cold start (Option A fallback)", () => {
  it("uses client-sent baselines when DB has no history", async () => {
    const { service } = await buildService([]);
    const clientBaselines: SignalSnapshot["baselines"] = {
      hrv_ms: 55,
      rhr_bpm: 62,
      sleep_deep_rem_pct: 28,
      days_of_history: 7,
      window_days: 14,
    };
    const result = await service.computeFor(SUBJECT, AS_OF, clientBaselines);
    expect(result).toBe(clientBaselines); // reference equality — not a copy
  });

  it("returns undefined when no history and no client fallback", async () => {
    const { service } = await buildService([]);
    const result = await service.computeFor(SUBJECT, AS_OF);
    // undefined baselines → baseline-dependent rules are UNKNOWN (not false) in the engine
    expect(result).toBeUndefined();
  });

  it("does NOT use client baselines when server has history (Option B always wins)", async () => {
    const rows: HistoryRow[] = [{ hrv_ms: 50, rhr_bpm: 60, sleep_deep_rem_pct: 30 }];
    const { service } = await buildService(rows);
    const clientBaselines: SignalSnapshot["baselines"] = {
      hrv_ms: 99, // deliberately wrong — should not be used
      rhr_bpm: 99,
      days_of_history: 1,
      window_days: 14,
    };
    const result = await service.computeFor(SUBJECT, AS_OF, clientBaselines);
    expect(result?.hrv_ms).toBeCloseTo(50); // server-computed, not client value
    expect(result?.hrv_ms).not.toBe(99);
  });
});
