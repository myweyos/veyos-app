/**
 * Android Health Connect: availability, permissions, and one day's readings (SCRUM-65).
 *
 * Reads only. Nothing is written back. Every value is the subject's own and goes to the Weyos
 * API as a `health_connect` vendor payload; the API's normaliser turns it into a canonical
 * snapshot (SCRUM-71). Nothing here compares a reading to anything: no rule logic on the device.
 *
 * Windows, in local time, for day D:
 *   night:  D-1 18:00 → D 14:00   HRV, resting HR fallback, the sleep session that ended then
 *   day:    D 00:00   → D+1 00:00 steps, resting HR
 * A reading outside its window is left out rather than guessed at. A missing signal reaches
 * the engine as missing (UNKNOWN), which is the point.
 *
 * Health Connect has no wrist temperature record in this library version, so rule 1.3 can't be
 * evaluated on Android. The Today screen says so rather than implying it was checked.
 */
import { Platform } from "react-native";
import {
  SdkAvailabilityStatus,
  SleepStageType,
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
} from "react-native-health-connect";

import { atLocal } from "./dates";

// The library declares Permission but doesn't export it.
type Permission = Parameters<typeof requestPermission>[0][number];

type ReadType = "HeartRateVariabilityRmssd" | "RestingHeartRate" | "SleepSession" | "Steps";

const BIOMETRIC_PERMISSIONS: Permission[] = (
  ["HeartRateVariabilityRmssd", "RestingHeartRate", "SleepSession", "Steps"] as ReadType[]
).map((recordType) => ({ accessType: "read", recordType }));

const CYCLE_PERMISSION: Permission = { accessType: "read", recordType: "MenstruationPeriod" };

export type Availability = "available" | "update_required" | "unavailable" | "not_android" | "web";

export async function availability(): Promise<Availability> {
  if (Platform.OS !== "android") return "not_android";
  const status = await getSdkStatus();
  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return "available";
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
    return "update_required";
  }
  return "unavailable";
}

let initialised = false;
async function ready(): Promise<void> {
  if (!initialised) initialised = await initialize();
  if (!initialised) throw new Error("health_connect_unavailable");
}

/** Ask for read access. Cycle access is only requested if the subject consented to it (A4). */
export async function connect(includeCycle: boolean): Promise<Set<string>> {
  await ready();
  const wanted = includeCycle ? [...BIOMETRIC_PERMISSIONS, CYCLE_PERMISSION] : BIOMETRIC_PERMISSIONS;
  const granted = await requestPermission(wanted);
  return new Set(granted.map((p) => p.recordType));
}

export async function grantedTypes(): Promise<Set<string>> {
  await ready();
  return new Set((await getGrantedPermissions()).map((p) => p.recordType));
}

export { openHealthConnectSettings };

export interface DayReadings {
  hrv_rmssd_ms: number | null;
  rhr_bpm: number | null;
  sleep_stages: {
    total_minutes: number;
    deep_minutes: number;
    rem_minutes: number;
    composite_score: null;
  } | null;
  steps: number | null;
}

const between = (start: Date, end: Date) => ({
  timeRangeFilter: { operator: "between" as const, startTime: start.toISOString(), endTime: end.toISOString() },
});

const minutes = (start: string, end: string): number =>
  Math.max(0, (Date.parse(end) - Date.parse(start)) / 60_000);

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** One local day's readings. Types the subject didn't grant come back null. */
export async function readDay(day: string, granted: Set<string>): Promise<DayReadings> {
  await ready();
  const nightStart = atLocal(day, -1, 18);
  const nightEnd = atLocal(day, 0, 14);
  const dayStart = atLocal(day);
  const dayEnd = atLocal(day, 1);

  const [hrv, rhr, sleep, steps] = await Promise.all([
    granted.has("HeartRateVariabilityRmssd") ? readHrv(nightStart, nightEnd) : null,
    granted.has("RestingHeartRate") ? readRhr(nightStart, dayEnd) : null,
    granted.has("SleepSession") ? readSleep(nightStart, nightEnd) : null,
    granted.has("Steps") ? readSteps(dayStart, dayEnd) : null,
  ]);
  return { hrv_rmssd_ms: hrv, rhr_bpm: rhr, sleep_stages: sleep, steps };
}

/** Overnight RMSSD, averaged over the night's samples. */
async function readHrv(start: Date, end: Date): Promise<number | null> {
  const records = await readRecords("HeartRateVariabilityRmssd", between(start, end));
  if (records.length === 0) return null;
  const sum = records.reduce((n, r) => n + r.heartRateVariabilityMillis, 0);
  return round1(sum / records.length);
}

/** The most recent resting heart rate in the window. */
async function readRhr(start: Date, end: Date): Promise<number | null> {
  const records = await readRecords("RestingHeartRate", between(start, end));
  const latest = [...records].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];
  return latest === undefined ? null : Math.round(latest.beatsPerMinute);
}

/**
 * The main sleep session that ended in the night window, as stage minutes.
 *
 * A session without stage data is left out rather than sent as zero deep/REM: rule 1.2 reads
 * deep+REM as a share of total sleep, and "no stages recorded" is not "no deep sleep".
 */
async function readSleep(start: Date, end: Date): Promise<DayReadings["sleep_stages"]> {
  const sessions = await readRecords("SleepSession", between(start, end));
  const staged = sessions.filter((s) => (s.stages?.length ?? 0) > 0);
  const main = staged.sort((a, b) => minutes(b.startTime, b.endTime) - minutes(a.startTime, a.endTime))[0];
  if (main?.stages === undefined) return null;

  let total = 0;
  let deep = 0;
  let rem = 0;
  for (const stage of main.stages) {
    const m = minutes(stage.startTime, stage.endTime);
    if (stage.stage === SleepStageType.DEEP) deep += m;
    if (stage.stage === SleepStageType.REM) rem += m;
    if (
      stage.stage === SleepStageType.DEEP ||
      stage.stage === SleepStageType.REM ||
      stage.stage === SleepStageType.LIGHT ||
      stage.stage === SleepStageType.SLEEPING
    ) {
      total += m;
    }
  }
  if (total === 0) return null;
  return { total_minutes: Math.round(total), deep_minutes: Math.round(deep), rem_minutes: Math.round(rem), composite_score: null };
}

/** Steps via the aggregate API, which de-duplicates overlapping sources (phone + watch). */
async function readSteps(start: Date, end: Date): Promise<number | null> {
  const result = await aggregateRecord({ recordType: "Steps", ...between(start, end) });
  return result.COUNT_TOTAL > 0 ? result.COUNT_TOTAL : null;
}

/**
 * The start of the most recent period in the last 90 days, from Health Connect.
 *
 * The library types MenstruationPeriod as instantaneous, but Health Connect returns it as an
 * interval with startTime/endTime (ReactMenstruationPeriodRecord.kt), so read either.
 */
export async function latestPeriodStart(now: Date = new Date()): Promise<Date | null> {
  await ready();
  const from = new Date(now.getTime() - 90 * 86_400_000);
  const records = (await readRecords("MenstruationPeriod", between(from, now))) as unknown as Array<{
    startTime?: string;
    time?: string;
  }>;
  const starts = records
    .map((r) => Date.parse(r.startTime ?? r.time ?? ""))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  return starts[0] === undefined ? null : new Date(starts[0]);
}
