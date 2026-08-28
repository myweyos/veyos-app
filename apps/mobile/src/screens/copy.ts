/**
 * Copy derivation.
 *
 * Two constraints bind everything here.
 *
 * BANNED VOCABULARY (hard constraint 4). Never: detect, diagnose, risk, prevent, treat,
 * symptom, condition, disorder, abnormal, medical, cardiac, patient, prescribe. Never, for
 * tone: should, must, failed, missed, streak. Note that `prescribed` is a FIELD NAME on the
 * Decision — it is data, and it must never reach a user-facing string.
 *
 * NO RULE LOGIC OUTSIDE THE ENGINE. Nothing here compares a reading to a threshold or
 * computes a deviation. Tiles show the reading and the subject's usual value as two plain
 * facts; the delta the engine actually used is already prose inside fired_rules[].because.
 * Recomputing it here would be a second implementation of the comparison the rulebook owns.
 */

import type { DemoDay } from "@weyos/demo-fixtures";

export interface Tile {
  label: string;
  value: string | null;
  detail?: string;
}

const round1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/**
 * One sentence for Today. Voice follows the state table in the design brief.
 *
 * Deliberately does not fill silence. On a quiet day it says one short thing and stops —
 * that restraint is the product's whole claim on the user's attention.
 */
export function headlineFor(day: DemoDay): string {
  switch (day.app_state) {
    case "calibrating":
      return "Still learning your baseline.";
    case "partial":
      return `In balance on what I can see. ${absentSignalSentence(day)}`;
    case "in_balance":
      return "In balance today.";
    case "advisory":
      return "Today's plan still works. I've adjusted the details.";
    case "intervention":
      return "Today needs a different shape.";
    case "declined":
      return "Noted. I've left today as you planned.";
  }
}

/**
 * Names the signal that did not arrive.
 *
 * Honest about the gap rather than papering over it — an unevaluable rule is not a rule that
 * came out false, and the user is told which reading is absent rather than being reassured
 * on incomplete data.
 */
function absentSignalSentence(day: DemoDay): string {
  const biometrics = day.snapshot.biometrics ?? {};
  const absent: string[] = [];
  if (biometrics.hrv_ms === null || biometrics.hrv_ms === undefined) {
    absent.push("Heart-rate variability");
  }
  if (biometrics.sleep_deep_rem_pct === null || biometrics.sleep_deep_rem_pct === undefined) {
    absent.push("Sleep");
  }
  if (absent.length === 0) return "Some of today's readings haven't arrived.";
  return `${absent.join(" and ")} hasn't synced.`;
}

/**
 * The signal tiles under the headline.
 *
 * A null reading renders as "Not available" — never as a zero, a dash or a flat line. Hard
 * constraint 2: never fake certainty.
 */
export function signalTilesFor(day: DemoDay): Tile[] {
  const bio = day.snapshot.biometrics ?? {};
  const base = day.snapshot.baselines ?? {};

  const usual = (value: number | null | undefined, unit: string): string | undefined =>
    value === null || value === undefined ? undefined : `usual ${round1(value)}${unit}`;

  return [
    {
      label: "Variability",
      value: bio.hrv_ms === null || bio.hrv_ms === undefined ? null : `${round1(bio.hrv_ms)} ms`,
      detail: usual(base.hrv_ms, " ms"),
    },
    {
      label: "Resting heart rate",
      value: bio.rhr_bpm === null || bio.rhr_bpm === undefined ? null : `${round1(bio.rhr_bpm)} bpm`,
      detail: usual(base.rhr_bpm, " bpm"),
    },
    {
      label: "Deep + REM",
      value:
        bio.sleep_deep_rem_pct === null || bio.sleep_deep_rem_pct === undefined
          ? null
          : `${round1(bio.sleep_deep_rem_pct)}%`,
      detail: usual(base.sleep_deep_rem_pct, "%"),
    },
    {
      label: "Temperature",
      value:
        bio.wrist_temp_delta_c === null || bio.wrist_temp_delta_c === undefined
          ? null
          : `${bio.wrist_temp_delta_c > 0 ? "+" : ""}${round1(bio.wrist_temp_delta_c)} °C`,
      detail: "vs your own baseline",
    },
  ];
}

/** Layer names as a user sees them. Rule ids live in the collapsed technical block only. */
export const LAYER_NAMES: Record<number, string> = {
  1: "Live biometrics",
  2: "Cycle phase",
  3: "Your food profile",
  4: "Season and surroundings",
  5: "Lab results",
};
