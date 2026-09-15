import { Test } from "@nestjs/testing";
import type { Provider } from "@nestjs/common";
import type { SignalSnapshot } from "@weyos/shared-schema";

import { REDIS_CLIENT } from "../redis/redis.tokens";
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

function makeRedis(cachedValue: string | null = null): jest.Mocked<{ get: jest.Mock; set: jest.Mock; del: jest.Mock }> {
  return {
    get: jest.fn().mockResolvedValue(cachedValue),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
  };
}

async function buildService(rows: HistoryRow[] = [], redis?: ReturnType<typeof makeRedis>) {
  const repo = makeRepo(rows);
  const providers: Provider[] = [
    BaselineComputationService,
    { provide: SignalSnapshotRepository, useValue: repo },
  ];
  if (redis !== undefined) {
    providers.push({ provide: REDIS_CLIENT, useValue: redis });
  }
  const module = await Test.createTestingModule({ providers }).compile();
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

describe("BaselineComputationService — Redis caching (SCRUM-73)", () => {
  it("returns the cached value on a Redis hit without querying Postgres", async () => {
    const rows: HistoryRow[] = [{ hrv_ms: 55, rhr_bpm: 60, sleep_deep_rem_pct: 30 }];
    const cachedBaselines: SignalSnapshot["baselines"] = {
      hrv_ms: 42,
      rhr_bpm: 58,
      sleep_deep_rem_pct: 25,
      days_of_history: 7,
      window_days: 14,
    };
    const redis = makeRedis(JSON.stringify(cachedBaselines));
    const { service, repo } = await buildService(rows, redis);

    const result = await service.computeFor(SUBJECT, AS_OF);

    expect(redis.get).toHaveBeenCalledWith(`baseline:${SUBJECT}:${AS_OF}`);
    expect(repo.biometricHistoryForSubject).not.toHaveBeenCalled();
    expect(result).toEqual(cachedBaselines);
  });

  it("queries Postgres and writes to Redis on a cache miss", async () => {
    const rows: HistoryRow[] = [{ hrv_ms: 55, rhr_bpm: 60, sleep_deep_rem_pct: 30 }];
    const redis = makeRedis(null); // cache miss
    const { service, repo } = await buildService(rows, redis);

    const result = await service.computeFor(SUBJECT, AS_OF);

    expect(redis.get).toHaveBeenCalledWith(`baseline:${SUBJECT}:${AS_OF}`);
    expect(repo.biometricHistoryForSubject).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith(
      `baseline:${SUBJECT}:${AS_OF}`,
      expect.any(String),
      "EX",
      82_800,
    );
    expect(result?.hrv_ms).toBeCloseTo(55);
  });

  it("invalidate() deletes the Redis key for the given subject and date", async () => {
    const redis = makeRedis();
    const { service } = await buildService([], redis);

    await service.invalidate(SUBJECT, AS_OF);

    expect(redis.del).toHaveBeenCalledWith(`baseline:${SUBJECT}:${AS_OF}`);
  });

  it("invalidate() does nothing when Redis is not injected", async () => {
    const { service } = await buildService([]);
    // Must not throw even without Redis
    await expect(service.invalidate(SUBJECT, AS_OF)).resolves.toBeUndefined();
  });

  it("does not cache the cold-start Option A fallback value", async () => {
    const redis = makeRedis(null);
    const { service } = await buildService([], redis);
    const clientBaselines: SignalSnapshot["baselines"] = { hrv_ms: 55, rhr_bpm: 62, days_of_history: 3, window_days: 14 };

    await service.computeFor(SUBJECT, AS_OF, clientBaselines);

    // Cold-start path returns early — Redis set must not be called
    expect(redis.set).not.toHaveBeenCalled();
  });
});
