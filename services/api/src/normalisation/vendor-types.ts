import type { SignalSnapshot } from "@weyos/shared-schema";

/**
 * Fields shared across every vendor format that flow through unchanged.
 *
 * baselines is included as the Option-A cold-start fallback: when the server
 * has fewer than 1 day of stored history, client-computed baselines are used
 * rather than leaving the engine with fully-unevaluable baseline-dependent rules.
 * Once the DB accumulates history, BaselineComputationService computes server-side
 * and this field is ignored.
 */
interface BaseVendorSnapshot {
  vendor_format: "healthkit" | "health_connect" | "ble";
  subject_ref: string;
  as_of: string;
  timezone?: string;
  constitution: SignalSnapshot["constitution"];
  baselines?: SignalSnapshot["baselines"];
  cycle?: SignalSnapshot["cycle"];
  environment?: SignalSnapshot["environment"];
  labs?: SignalSnapshot["labs"];
  planned_activity?: SignalSnapshot["planned_activity"];
  planned_meals?: SignalSnapshot["planned_meals"];
  captured_at?: string;
}

/**
 * Raw HealthKit fields before normalisation.
 *
 * SDNN/RMSSD contract: HealthKit exposes HRV as
 * HKQuantityTypeIdentifierHeartRateVariabilitySDNN (SDNN measured over 1-minute
 * intervals). By product contract we treat this value as RMSSD. Apple's
 * implementation closely tracks RMSSD at 1-minute windows — this is a documented
 * fixed assumption, not an approximation under ongoing review.
 */
export interface HealthKitSnapshot extends BaseVendorSnapshot {
  vendor_format: "healthkit";
  /** SDNN treated as RMSSD — see type JSDoc above. */
  hrv_sdnn_ms: number | null;
  rhr_bpm: number | null;
  sleep_stages: {
    total_minutes: number;
    deep_minutes: number;
    rem_minutes: number;
    /** Vendor composite (Apple sleep score). Carried display-only; rules must not read. */
    composite_score: number | null;
  } | null;
  /**
   * Already a delta from the subject's own temperature baseline, supplied by
   * HKQuantityTypeIdentifierAppleSleepingWristTemperature. Passes through unchanged.
   */
  wrist_temp_delta_c: number | null;
  steps: number | null;
}

/**
 * Raw Health Connect fields.
 * HRV is HeartRateVariabilityRmssdRecord — natively RMSSD; maps 1:1 to hrv_ms.
 * Health Connect does not expose wrist skin temperature.
 */
export interface HealthConnectSnapshot extends BaseVendorSnapshot {
  vendor_format: "health_connect";
  hrv_rmssd_ms: number | null;
  rhr_bpm: number | null;
  sleep_stages: {
    total_minutes: number;
    deep_minutes: number;
    rem_minutes: number;
    composite_score: number | null;
  } | null;
  steps: number | null;
}

/**
 * BLE chest strap (e.g. Polar H10).
 * RMSSD is computed on-device from raw R-R intervals before upload.
 * No sleep stages, no wrist temperature.
 */
export interface BleSnapshot extends BaseVendorSnapshot {
  vendor_format: "ble";
  hrv_rmssd_ms: number | null;
  rhr_bpm: number | null;
  steps: number | null;
}

export type VendorSnapshot = HealthKitSnapshot | HealthConnectSnapshot | BleSnapshot;

/**
 * Union of all payloads accepted by POST /v1/ingest/snapshot.
 * Canonical payloads (no vendor_format) bypass normalisation and go straight to validation.
 */
export type IngestPayload = VendorSnapshot | (SignalSnapshot & { vendor_format?: never });
