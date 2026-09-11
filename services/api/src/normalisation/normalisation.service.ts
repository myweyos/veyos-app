import { Injectable, Logger } from "@nestjs/common";
import type { SignalSnapshot } from "@weyos/shared-schema";

import { SignalSnapshotRepository } from "../store/signal-snapshot.repository";
import type {
  BleSnapshot,
  HealthConnectSnapshot,
  HealthKitSnapshot,
  IngestPayload,
  VendorSnapshot,
} from "./vendor-types";

/**
 * Source priority for per-field merge when multiple sources send data for the same
 * (subject_ref, as_of). Higher number = higher priority.
 * BLE (direct sensor) > HealthKit (wearable) > Health Connect (wearable) > manual (user entry)
 */
const SOURCE_PRIORITY: Record<string, number> = {
  ble: 4,
  healthkit: 3,
  health_connect: 2,
  manual: 1,
  simulated: 0,
};

// Biometrics without undefined — for use inside normaliser functions and merge logic.
// SignalSnapshot["biometrics"] is optional so includes undefined; this alias excludes it.
type Biometrics = NonNullable<SignalSnapshot["biometrics"]>;

@Injectable()
export class NormalisationService {
  private readonly log = new Logger(NormalisationService.name);

  constructor(private readonly snapshots: SignalSnapshotRepository) {}

  /**
   * Converts a vendor payload into a canonical SignalSnapshot, then merges it with
   * any existing snapshot for the same (subject_ref, as_of) using field-level priority.
   *
   * Canonical payloads (no vendor_format) bypass normalisation and merge, returning
   * the value unchanged — this preserves test and backwards-compatibility paths.
   *
   * baselines are NOT included in the returned snapshot; they are computed separately
   * by BaselineComputationService after this call.
   */
  async normalise(payload: IngestPayload): Promise<SignalSnapshot> {
    if (!isVendorPayload(payload)) {
      return payload;
    }

    const canonical = toCanonical(payload);

    const existing = await this.snapshots.latestForSubject(payload.subject_ref, payload.as_of);
    if (!existing) {
      return canonical;
    }

    const merged = mergeByFieldPriority(canonical, existing);
    this.log.log(
      `snapshot merged: subject=${payload.subject_ref.slice(0, 8)} as_of=${payload.as_of} incoming=${payload.vendor_format} existing_source=${existing.biometrics?.source ?? "none"}`,
    );
    return merged;
  }
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isVendorPayload(payload: IngestPayload): payload is VendorSnapshot {
  if (typeof payload !== "object" || payload === null) return false;
  const vf = (payload as unknown as Record<string, unknown>)["vendor_format"];
  return vf === "healthkit" || vf === "health_connect" || vf === "ble";
}

// ---------------------------------------------------------------------------
// Vendor → canonical conversion
// ---------------------------------------------------------------------------

function toCanonical(vendor: VendorSnapshot): SignalSnapshot {
  let biometrics: Biometrics;
  switch (vendor.vendor_format) {
    case "healthkit":
      biometrics = normaliseHealthKit(vendor);
      break;
    case "health_connect":
      biometrics = normaliseHealthConnect(vendor);
      break;
    case "ble":
      biometrics = normaliseBle(vendor);
      break;
  }

  const snapshot: SignalSnapshot = {
    schema_version: 1,
    subject_ref: vendor.subject_ref,
    as_of: vendor.as_of,
    constitution: vendor.constitution,
    biometrics,
  };

  if (vendor.timezone !== undefined) snapshot.timezone = vendor.timezone;
  // baselines from the vendor payload are the Option-A cold-start fallback.
  // They are kept here so the ingestion controller can pass them to
  // BaselineComputationService.computeFor() as the fallback argument.
  if (vendor.baselines !== undefined) snapshot.baselines = vendor.baselines;
  if (vendor.cycle !== undefined) snapshot.cycle = vendor.cycle;
  if (vendor.environment !== undefined) snapshot.environment = vendor.environment;
  if (vendor.labs !== undefined) snapshot.labs = vendor.labs;
  if (vendor.planned_activity !== undefined) snapshot.planned_activity = vendor.planned_activity;
  if (vendor.planned_meals !== undefined) snapshot.planned_meals = vendor.planned_meals;

  return snapshot;
}

function normaliseSleepStages(
  stages: {
    total_minutes: number;
    deep_minutes: number;
    rem_minutes: number;
    composite_score: number | null;
  } | null,
): { sleep_deep_rem_pct: number | null; sleep_score: number | null } {
  if (!stages) return { sleep_deep_rem_pct: null, sleep_score: null };
  const pct =
    stages.total_minutes > 0
      ? ((stages.deep_minutes + stages.rem_minutes) / stages.total_minutes) * 100
      : null;
  return { sleep_deep_rem_pct: pct, sleep_score: stages.composite_score };
}

function normaliseHealthKit(p: HealthKitSnapshot): Biometrics {
  const { sleep_deep_rem_pct, sleep_score } = normaliseSleepStages(p.sleep_stages);
  return {
    hrv_ms: p.hrv_sdnn_ms, // SDNN treated as RMSSD — see HealthKitSnapshot JSDoc
    rhr_bpm: p.rhr_bpm,
    sleep_deep_rem_pct,
    sleep_score,
    wrist_temp_delta_c: p.wrist_temp_delta_c,
    steps: p.steps,
    source: "healthkit",
    ...(p.captured_at !== undefined && { captured_at: p.captured_at }),
  };
}

function normaliseHealthConnect(p: HealthConnectSnapshot): Biometrics {
  const { sleep_deep_rem_pct, sleep_score } = normaliseSleepStages(p.sleep_stages);
  return {
    hrv_ms: p.hrv_rmssd_ms,
    rhr_bpm: p.rhr_bpm,
    sleep_deep_rem_pct,
    sleep_score,
    wrist_temp_delta_c: null, // Health Connect has no wrist temperature sensor
    steps: p.steps,
    source: "health_connect",
    ...(p.captured_at !== undefined && { captured_at: p.captured_at }),
  };
}

function normaliseBle(p: BleSnapshot): Biometrics {
  return {
    hrv_ms: p.hrv_rmssd_ms,
    rhr_bpm: p.rhr_bpm,
    sleep_deep_rem_pct: null, // BLE chest strap: no sleep sensor
    sleep_score: null,
    wrist_temp_delta_c: null, // BLE chest strap: no wrist temperature sensor
    steps: p.steps,
    source: "ble",
    ...(p.captured_at !== undefined && { captured_at: p.captured_at }),
  };
}

// ---------------------------------------------------------------------------
// Per-field priority merge
// ---------------------------------------------------------------------------

function priorityOf(source: string | undefined): number {
  return SOURCE_PRIORITY[source ?? ""] ?? 0;
}

/**
 * Returns the value from whichever source has higher priority and a non-null value.
 * If only one source has a value, that value wins regardless of priority.
 * If both are null/undefined, returns null.
 */
function pickField<T>(
  inVal: T | null | undefined,
  inPriority: number,
  exVal: T | null | undefined,
  exPriority: number,
): T | null {
  const hasIn = inVal !== null && inVal !== undefined;
  const hasEx = exVal !== null && exVal !== undefined;
  if (hasIn && hasEx) return inPriority >= exPriority ? inVal : exVal;
  if (hasIn) return inVal;
  if (hasEx) return exVal;
  return null;
}

function mergeByFieldPriority(incoming: SignalSnapshot, existing: SignalSnapshot): SignalSnapshot {
  const inP = priorityOf(incoming.biometrics?.source);
  const exP = priorityOf(existing.biometrics?.source);
  const inB = incoming.biometrics;
  const exB = existing.biometrics;

  // source reflects the highest-priority source that contributed biometric fields
  const winningSource = inP >= exP ? inB?.source : exB?.source;
  const capturedAt = pickField(inB?.captured_at, inP, exB?.captured_at, exP);

  const mergedBiometrics: Biometrics = {
    hrv_ms: pickField(inB?.hrv_ms, inP, exB?.hrv_ms, exP),
    rhr_bpm: pickField(inB?.rhr_bpm, inP, exB?.rhr_bpm, exP),
    sleep_deep_rem_pct: pickField(inB?.sleep_deep_rem_pct, inP, exB?.sleep_deep_rem_pct, exP),
    sleep_score: pickField(inB?.sleep_score, inP, exB?.sleep_score, exP),
    wrist_temp_delta_c: pickField(inB?.wrist_temp_delta_c, inP, exB?.wrist_temp_delta_c, exP),
    steps: pickField(inB?.steps, inP, exB?.steps, exP),
    ...(winningSource !== undefined && { source: winningSource }),
    ...(capturedAt !== null && { captured_at: capturedAt }),
  };

  // Build merged snapshot field-by-field to satisfy exactOptionalPropertyTypes
  // (object spread + baselines: undefined is rejected; explicit assignment is not).
  // baselines intentionally absent — BaselineComputationService recomputes after merge.
  // incoming wins for non-biometric optional fields (fresher cycle, environment, labs, etc.)
  const merged: SignalSnapshot = {
    schema_version: incoming.schema_version,
    subject_ref: incoming.subject_ref,
    as_of: incoming.as_of,
    constitution: incoming.constitution,
    biometrics: mergedBiometrics,
  };

  const tz = incoming.timezone ?? existing.timezone;
  if (tz !== undefined) merged.timezone = tz;

  const cycle = incoming.cycle !== undefined ? incoming.cycle : existing.cycle;
  if (cycle !== undefined) merged.cycle = cycle;

  const env = incoming.environment ?? existing.environment;
  if (env !== undefined) merged.environment = env;

  const labs = incoming.labs ?? existing.labs;
  if (labs !== undefined) merged.labs = labs;

  const act = incoming.planned_activity !== undefined ? incoming.planned_activity : existing.planned_activity;
  if (act !== undefined) merged.planned_activity = act;

  const meals = incoming.planned_meals ?? existing.planned_meals;
  if (meals !== undefined) merged.planned_meals = meals;

  return merged;
}
