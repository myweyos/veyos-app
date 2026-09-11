import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SignalSnapshot } from "@weyos/shared-schema";
import type { Sql } from "postgres";

import { DB_POOL } from "../database/database.provider";

/**
 * Persists and retrieves SignalSnapshot rows from the signal_snapshots hypertable.
 *
 * LOGGING DISCIPLINE: method name, subject_ref prefix (first 8 chars for debuggability),
 * as_of date. Never any biometric column value — rule IDs, deltas and booleans only.
 */
@Injectable()
export class SignalSnapshotRepository {
  private readonly log = new Logger(SignalSnapshotRepository.name);

  constructor(@Inject(DB_POOL) private readonly sql: Sql) {}

  /**
   * Upsert a snapshot for (subject_ref, as_of).
   *
   * On conflict (same subject, same day) the row is overwritten. See ADR 0007 for the open
   * question on same-day multi-source snapshots — this behaviour may need revision once Phase 3
   * (Native Signals) connects real wearables.
   *
   * snapshot_json stores the full original payload for lossless round-trip retrieval.
   * ingested_at always uses the server-side DEFAULT to prevent clock skew.
   */
  async upsert(snapshot: SignalSnapshot): Promise<void> {
    const b = snapshot.biometrics;
    const bl = snapshot.baselines;
    const cy = snapshot.cycle;
    const env = snapshot.environment;
    const pm = snapshot.labs?.pm_cortisol;
    const crp = snapshot.labs?.hs_crp;
    const hba = snapshot.labs?.hba1c;
    const glc = snapshot.labs?.fasting_glucose;
    const act = snapshot.planned_activity;

    // snapshot_json and planned_meals are stored as JSONB by passing the object directly with
    // ::jsonb in the template literal. postgres.js serialises objects correctly as JSONB objects.
    // Do NOT use JSON.stringify — postgres.js treats a pre-stringified value as a JSON string
    // (double-serialisation), resulting in jsonb_typeof = 'string' instead of 'object'.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshotJson: any = snapshot;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plannedMealsJson: any = snapshot.planned_meals ?? null;

    await this.sql`
      INSERT INTO signal_snapshots (
        subject_ref, as_of, schema_version, timezone,
        hrv_ms, rhr_bpm, sleep_deep_rem_pct, sleep_score,
        wrist_temp_delta_c, steps, biometrics_source, captured_at,
        baseline_hrv_ms, baseline_hrv_sd, baseline_rhr_bpm, baseline_rhr_sd,
        baseline_sleep_deep_rem_pct, baseline_days_of_history, baseline_window_days,
        cycle_day, cycle_length, cycle_tracked,
        dosha,
        ambient_temp_c, moon_phase, season, wind_kph, pollen_index, aqi,
        lab_pm_cortisol_status, lab_pm_cortisol_value, lab_pm_cortisol_unit, lab_pm_cortisol_collected_on,
        lab_hs_crp_status, lab_hs_crp_value, lab_hs_crp_unit, lab_hs_crp_collected_on,
        lab_hba1c_status, lab_hba1c_value, lab_hba1c_unit, lab_hba1c_collected_on,
        lab_fasting_glucose_status, lab_fasting_glucose_value, lab_fasting_glucose_unit, lab_fasting_glucose_collected_on,
        activity_type, activity_intensity, activity_location, activity_planned_at,
        planned_meals,
        snapshot_json
      ) VALUES (
        ${snapshot.subject_ref}, ${snapshot.as_of}, ${snapshot.schema_version}, ${snapshot.timezone ?? null},
        ${b?.hrv_ms ?? null}, ${b?.rhr_bpm ?? null}, ${b?.sleep_deep_rem_pct ?? null}, ${b?.sleep_score ?? null},
        ${b?.wrist_temp_delta_c ?? null}, ${b?.steps ?? null}, ${b?.source ?? null}, ${b?.captured_at ?? null},
        ${bl?.hrv_ms ?? null}, ${bl?.hrv_sd ?? null}, ${bl?.rhr_bpm ?? null}, ${bl?.rhr_sd ?? null},
        ${bl?.sleep_deep_rem_pct ?? null}, ${bl?.days_of_history ?? null}, ${bl?.window_days ?? null},
        ${cy?.cycle_day ?? null}, ${cy?.cycle_length ?? null}, ${cy?.tracked ?? null},
        ${snapshot.constitution.dosha},
        ${env?.ambient_temp_c ?? null}, ${env?.moon_phase ?? null}, ${env?.season ?? null},
        ${env?.wind_kph ?? null}, ${env?.pollen_index ?? null}, ${env?.aqi ?? null},
        ${pm?.status ?? null}, ${pm?.value ?? null}, ${pm?.unit ?? null}, ${pm?.collected_on ?? null},
        ${crp?.status ?? null}, ${crp?.value ?? null}, ${crp?.unit ?? null}, ${crp?.collected_on ?? null},
        ${hba?.status ?? null}, ${hba?.value ?? null}, ${hba?.unit ?? null}, ${hba?.collected_on ?? null},
        ${glc?.status ?? null}, ${glc?.value ?? null}, ${glc?.unit ?? null}, ${glc?.collected_on ?? null},
        ${act?.type ?? null}, ${act?.intensity ?? null}, ${act?.location ?? null}, ${act?.planned_at ?? null},
        ${plannedMealsJson}::jsonb,
        ${snapshotJson}::jsonb
      )
      ON CONFLICT (subject_ref, as_of) DO UPDATE SET
        schema_version = EXCLUDED.schema_version,
        timezone = EXCLUDED.timezone,
        hrv_ms = EXCLUDED.hrv_ms,
        rhr_bpm = EXCLUDED.rhr_bpm,
        sleep_deep_rem_pct = EXCLUDED.sleep_deep_rem_pct,
        sleep_score = EXCLUDED.sleep_score,
        wrist_temp_delta_c = EXCLUDED.wrist_temp_delta_c,
        steps = EXCLUDED.steps,
        biometrics_source = EXCLUDED.biometrics_source,
        captured_at = EXCLUDED.captured_at,
        baseline_hrv_ms = EXCLUDED.baseline_hrv_ms,
        baseline_hrv_sd = EXCLUDED.baseline_hrv_sd,
        baseline_rhr_bpm = EXCLUDED.baseline_rhr_bpm,
        baseline_rhr_sd = EXCLUDED.baseline_rhr_sd,
        baseline_sleep_deep_rem_pct = EXCLUDED.baseline_sleep_deep_rem_pct,
        baseline_days_of_history = EXCLUDED.baseline_days_of_history,
        baseline_window_days = EXCLUDED.baseline_window_days,
        cycle_day = EXCLUDED.cycle_day,
        cycle_length = EXCLUDED.cycle_length,
        cycle_tracked = EXCLUDED.cycle_tracked,
        dosha = EXCLUDED.dosha,
        ambient_temp_c = EXCLUDED.ambient_temp_c,
        moon_phase = EXCLUDED.moon_phase,
        season = EXCLUDED.season,
        wind_kph = EXCLUDED.wind_kph,
        pollen_index = EXCLUDED.pollen_index,
        aqi = EXCLUDED.aqi,
        lab_pm_cortisol_status = EXCLUDED.lab_pm_cortisol_status,
        lab_pm_cortisol_value = EXCLUDED.lab_pm_cortisol_value,
        lab_pm_cortisol_unit = EXCLUDED.lab_pm_cortisol_unit,
        lab_pm_cortisol_collected_on = EXCLUDED.lab_pm_cortisol_collected_on,
        lab_hs_crp_status = EXCLUDED.lab_hs_crp_status,
        lab_hs_crp_value = EXCLUDED.lab_hs_crp_value,
        lab_hs_crp_unit = EXCLUDED.lab_hs_crp_unit,
        lab_hs_crp_collected_on = EXCLUDED.lab_hs_crp_collected_on,
        lab_hba1c_status = EXCLUDED.lab_hba1c_status,
        lab_hba1c_value = EXCLUDED.lab_hba1c_value,
        lab_hba1c_unit = EXCLUDED.lab_hba1c_unit,
        lab_hba1c_collected_on = EXCLUDED.lab_hba1c_collected_on,
        lab_fasting_glucose_status = EXCLUDED.lab_fasting_glucose_status,
        lab_fasting_glucose_value = EXCLUDED.lab_fasting_glucose_value,
        lab_fasting_glucose_unit = EXCLUDED.lab_fasting_glucose_unit,
        lab_fasting_glucose_collected_on = EXCLUDED.lab_fasting_glucose_collected_on,
        activity_type = EXCLUDED.activity_type,
        activity_intensity = EXCLUDED.activity_intensity,
        activity_location = EXCLUDED.activity_location,
        activity_planned_at = EXCLUDED.activity_planned_at,
        planned_meals = EXCLUDED.planned_meals,
        snapshot_json = EXCLUDED.snapshot_json,
        ingested_at = now()
    `;

    this.log.log(
      `snapshot upserted: subject=${snapshot.subject_ref.slice(0, 8)} as_of=${snapshot.as_of}`,
    );
  }

  /**
   * Returns the most recent snapshot for a subject on a given date (defaults to today).
   *
   * Returns null — not throws — when no snapshot exists. The caller decides the 404 policy.
   */
  async latestForSubject(subjectRef: string, asOf?: string): Promise<SignalSnapshot | null> {
    const date = asOf ?? new Date().toISOString().slice(0, 10);
    const rows = await this.sql<{ snapshot_json: SignalSnapshot }[]>`
      SELECT snapshot_json
      FROM signal_snapshots
      WHERE subject_ref = ${subjectRef}
        AND as_of = ${date}
      ORDER BY ingested_at DESC
      LIMIT 1
    `;
    return rows[0]?.snapshot_json ?? null;
  }

  /**
   * Returns biometric readings for the windowDays days BEFORE beforeDate (exclusive),
   * ordered newest-first. Used by BaselineComputationService to compute rolling means.
   *
   * Excludes beforeDate itself to avoid circular baselines (using today's reading to
   * validate today's reading). Returns only the three fields the baseline service needs.
   */
  async biometricHistoryForSubject(
    subjectRef: string,
    beforeDate: string,
    windowDays: number,
  ): Promise<{ hrv_ms: number | null; rhr_bpm: number | null; sleep_deep_rem_pct: number | null }[]> {
    return this.sql<
      { hrv_ms: number | null; rhr_bpm: number | null; sleep_deep_rem_pct: number | null }[]
    >`
      SELECT hrv_ms, rhr_bpm, sleep_deep_rem_pct
      FROM signal_snapshots
      WHERE subject_ref = ${subjectRef}
        AND as_of < ${beforeDate}::date
        AND as_of >= (${beforeDate}::date - ${windowDays} * INTERVAL '1 day')::date
      ORDER BY as_of DESC
    `;
  }
}
