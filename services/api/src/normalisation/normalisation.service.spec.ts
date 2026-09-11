import { Test } from "@nestjs/testing";
import type { SignalSnapshot } from "@weyos/shared-schema";

import { SignalSnapshotRepository } from "../store/signal-snapshot.repository";
import { NormalisationService } from "./normalisation.service";
import type { BleSnapshot, HealthConnectSnapshot, HealthKitSnapshot } from "./vendor-types";

const BASE = {
  subject_ref: "sub_test12345678",
  as_of: "2026-09-11",
  constitution: { dosha: "vata" as const },
} as const;

function makeRepo(existing: SignalSnapshot | null = null): jest.Mocked<SignalSnapshotRepository> {
  return {
    latestForSubject: jest.fn().mockResolvedValue(existing),
    upsert: jest.fn(),
    biometricHistoryForSubject: jest.fn(),
  } as unknown as jest.Mocked<SignalSnapshotRepository>;
}

async function buildService(
  existing: SignalSnapshot | null = null,
): Promise<{ service: NormalisationService; repo: jest.Mocked<SignalSnapshotRepository> }> {
  const repo = makeRepo(existing);
  const module = await Test.createTestingModule({
    providers: [
      NormalisationService,
      { provide: SignalSnapshotRepository, useValue: repo },
    ],
  }).compile();
  return { service: module.get(NormalisationService), repo };
}

// ---------------------------------------------------------------------------
// HealthKit normalisation
// ---------------------------------------------------------------------------

describe("NormalisationService — HealthKit", () => {
  it("maps hrv_sdnn_ms → hrv_ms (SDNN treated as RMSSD per product contract)", async () => {
    const { service } = await buildService();
    const payload: HealthKitSnapshot = {
      vendor_format: "healthkit", ...BASE,
      hrv_sdnn_ms: 45, rhr_bpm: 58, sleep_stages: null, wrist_temp_delta_c: null, steps: null,
    };
    const result = await service.normalise(payload);
    expect(result.biometrics?.hrv_ms).toBe(45);
    expect(result.biometrics?.source).toBe("healthkit");
  });

  it("computes sleep_deep_rem_pct from stage minutes", async () => {
    const { service } = await buildService();
    const payload: HealthKitSnapshot = {
      vendor_format: "healthkit", ...BASE,
      hrv_sdnn_ms: null, rhr_bpm: null, steps: null, wrist_temp_delta_c: null,
      sleep_stages: { total_minutes: 480, deep_minutes: 60, rem_minutes: 90, composite_score: 82 },
    };
    const result = await service.normalise(payload);
    // (60 + 90) / 480 * 100 = 31.25
    expect(result.biometrics?.sleep_deep_rem_pct).toBeCloseTo(31.25);
  });

  it("places vendor composite in sleep_score, not in sleep_deep_rem_pct", async () => {
    const { service } = await buildService();
    const payload: HealthKitSnapshot = {
      vendor_format: "healthkit", ...BASE,
      hrv_sdnn_ms: null, rhr_bpm: null, steps: null, wrist_temp_delta_c: null,
      sleep_stages: { total_minutes: 480, deep_minutes: 60, rem_minutes: 90, composite_score: 82 },
    };
    const result = await service.normalise(payload);
    expect(result.biometrics?.sleep_score).toBe(82);
    expect(result.biometrics?.sleep_deep_rem_pct).not.toBe(82);
  });

  it("returns null sleep_deep_rem_pct when total_minutes is 0 (avoids division by zero)", async () => {
    const { service } = await buildService();
    const payload: HealthKitSnapshot = {
      vendor_format: "healthkit", ...BASE,
      hrv_sdnn_ms: null, rhr_bpm: null, steps: null, wrist_temp_delta_c: null,
      sleep_stages: { total_minutes: 0, deep_minutes: 0, rem_minutes: 0, composite_score: null },
    };
    const result = await service.normalise(payload);
    expect(result.biometrics?.sleep_deep_rem_pct).toBeNull();
  });

  it("returns null sleep_deep_rem_pct when sleep_stages is null", async () => {
    const { service } = await buildService();
    const payload: HealthKitSnapshot = {
      vendor_format: "healthkit", ...BASE,
      hrv_sdnn_ms: null, rhr_bpm: null, steps: null, wrist_temp_delta_c: null,
      sleep_stages: null,
    };
    const result = await service.normalise(payload);
    expect(result.biometrics?.sleep_deep_rem_pct).toBeNull();
    expect(result.biometrics?.sleep_score).toBeNull();
  });

  it("passes wrist_temp_delta_c through unchanged (already a delta from HK)", async () => {
    const { service } = await buildService();
    const payload: HealthKitSnapshot = {
      vendor_format: "healthkit", ...BASE,
      hrv_sdnn_ms: null, rhr_bpm: null, steps: null, sleep_stages: null,
      wrist_temp_delta_c: 0.6,
    };
    const result = await service.normalise(payload);
    expect(result.biometrics?.wrist_temp_delta_c).toBe(0.6);
  });
});

// ---------------------------------------------------------------------------
// Health Connect normalisation
// ---------------------------------------------------------------------------

describe("NormalisationService — Health Connect", () => {
  it("maps hrv_rmssd_ms → hrv_ms (natively RMSSD)", async () => {
    const { service } = await buildService();
    const payload: HealthConnectSnapshot = {
      vendor_format: "health_connect", ...BASE,
      hrv_rmssd_ms: 52, rhr_bpm: 60, sleep_stages: null, steps: 8000,
    };
    const result = await service.normalise(payload);
    expect(result.biometrics?.hrv_ms).toBe(52);
    expect(result.biometrics?.source).toBe("health_connect");
  });

  it("sets wrist_temp_delta_c to null (Health Connect has no wrist temperature sensor)", async () => {
    const { service } = await buildService();
    const payload: HealthConnectSnapshot = {
      vendor_format: "health_connect", ...BASE,
      hrv_rmssd_ms: null, rhr_bpm: null, sleep_stages: null, steps: null,
    };
    const result = await service.normalise(payload);
    expect(result.biometrics?.wrist_temp_delta_c).toBeNull();
  });

  it("computes sleep_deep_rem_pct from stage minutes", async () => {
    const { service } = await buildService();
    const payload: HealthConnectSnapshot = {
      vendor_format: "health_connect", ...BASE,
      hrv_rmssd_ms: null, rhr_bpm: null, steps: null,
      sleep_stages: { total_minutes: 400, deep_minutes: 40, rem_minutes: 80, composite_score: null },
    };
    const result = await service.normalise(payload);
    // (40 + 80) / 400 * 100 = 30
    expect(result.biometrics?.sleep_deep_rem_pct).toBeCloseTo(30);
  });
});

// ---------------------------------------------------------------------------
// BLE normalisation
// ---------------------------------------------------------------------------

describe("NormalisationService — BLE", () => {
  it("maps hrv_rmssd_ms → hrv_ms (RMSSD computed on-device from R-R intervals)", async () => {
    const { service } = await buildService();
    const payload: BleSnapshot = {
      vendor_format: "ble", ...BASE,
      hrv_rmssd_ms: 38, rhr_bpm: 72, steps: null,
    };
    const result = await service.normalise(payload);
    expect(result.biometrics?.hrv_ms).toBe(38);
    expect(result.biometrics?.source).toBe("ble");
  });

  it("sets sleep and wrist_temp_delta_c to null (BLE chest strap has no sensors for these)", async () => {
    const { service } = await buildService();
    const payload: BleSnapshot = {
      vendor_format: "ble", ...BASE,
      hrv_rmssd_ms: 38, rhr_bpm: 72, steps: null,
    };
    const result = await service.normalise(payload);
    expect(result.biometrics?.sleep_deep_rem_pct).toBeNull();
    expect(result.biometrics?.sleep_score).toBeNull();
    expect(result.biometrics?.wrist_temp_delta_c).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Canonical pass-through
// ---------------------------------------------------------------------------

describe("NormalisationService — canonical pass-through", () => {
  it("returns canonical payload unchanged (reference equality) when no vendor_format", async () => {
    const { service } = await buildService();
    const canonical: SignalSnapshot = {
      schema_version: 1, ...BASE,
      biometrics: { hrv_ms: 55, source: "manual" },
    };
    const result = await service.normalise(canonical);
    expect(result).toBe(canonical);
  });
});

// ---------------------------------------------------------------------------
// Multi-source merge
// ---------------------------------------------------------------------------

describe("NormalisationService — multi-source merge", () => {
  const existingBle: SignalSnapshot = {
    schema_version: 1, ...BASE,
    biometrics: {
      hrv_ms: 40, rhr_bpm: 65,
      sleep_deep_rem_pct: null, sleep_score: null, wrist_temp_delta_c: null,
      steps: 3000, source: "ble",
    },
  };

  it("BLE (priority 4) wins HRV and RHR over HealthKit (priority 3) when both are present", async () => {
    const { service } = await buildService(existingBle);
    const payload: HealthKitSnapshot = {
      vendor_format: "healthkit", ...BASE,
      hrv_sdnn_ms: 55, rhr_bpm: 68,
      sleep_stages: { total_minutes: 480, deep_minutes: 70, rem_minutes: 100, composite_score: 85 },
      wrist_temp_delta_c: 0.6, steps: 8000,
    };
    const result = await service.normalise(payload);

    expect(result.biometrics?.hrv_ms).toBe(40); // BLE wins
    expect(result.biometrics?.rhr_bpm).toBe(65); // BLE wins
    expect(result.biometrics?.sleep_deep_rem_pct).toBeCloseTo((70 + 100) / 480 * 100); // HK fills in
    expect(result.biometrics?.wrist_temp_delta_c).toBe(0.6); // HK fills in (BLE had null)
    expect(result.biometrics?.source).toBe("ble");
  });

  it("HealthKit fills in HRV when existing BLE snapshot has null for that field", async () => {
    const bleWithNullHrv: SignalSnapshot = {
      schema_version: 1, ...BASE,
      biometrics: { hrv_ms: null, rhr_bpm: 65, source: "ble" },
    };
    const { service } = await buildService(bleWithNullHrv);
    const payload: HealthKitSnapshot = {
      vendor_format: "healthkit", ...BASE,
      hrv_sdnn_ms: 55, rhr_bpm: 68,
      sleep_stages: null, wrist_temp_delta_c: null, steps: null,
    };
    const result = await service.normalise(payload);

    // BLE has null HRV → HealthKit fills in regardless of priority
    expect(result.biometrics?.hrv_ms).toBe(55);
    // BLE has 65 for RHR, HK has 68 — BLE wins
    expect(result.biometrics?.rhr_bpm).toBe(65);
  });

  it("merged snapshot has baselines cleared (always recomputed by BaselineComputationService)", async () => {
    const existingWithBaselines: SignalSnapshot = {
      schema_version: 1, ...BASE,
      biometrics: { hrv_ms: 40, source: "ble" },
      baselines: { hrv_ms: 50, rhr_bpm: 60, days_of_history: 14 },
    };
    const { service } = await buildService(existingWithBaselines);
    const payload: HealthKitSnapshot = {
      vendor_format: "healthkit", ...BASE,
      hrv_sdnn_ms: 55, rhr_bpm: null,
      sleep_stages: null, wrist_temp_delta_c: null, steps: null,
    };
    const result = await service.normalise(payload);
    expect(result.baselines).toBeUndefined();
  });

  it("does not merge when no existing snapshot for the day", async () => {
    const { service } = await buildService(null);
    const payload: HealthKitSnapshot = {
      vendor_format: "healthkit", ...BASE,
      hrv_sdnn_ms: 55, rhr_bpm: 68,
      sleep_stages: null, wrist_temp_delta_c: null, steps: null,
    };
    const result = await service.normalise(payload);
    expect(result.biometrics?.hrv_ms).toBe(55);
  });
});
