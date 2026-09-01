/**
 * Copy and signal derivation.
 *
 * Two constraints bind everything here.
 *
 * BANNED VOCABULARY. Never: detect, diagnose, risk, prevent, treat, symptom, condition,
 * disorder, abnormal, medical, cardiac, patient, prescribe. Never, for tone: should, must,
 * failed, missed, streak. Note `prescribed` is a FIELD NAME on the Decision — it is data and
 * must never reach a user-facing string.
 *
 * NO RULE LOGIC OUTSIDE THE ENGINE. Nothing here compares a reading to a threshold or
 * computes a deviation. Tiles show the reading and the subject's usual value as two plain
 * facts; the delta the engine actually used is already prose inside fired_rules[].because.
 */

import type { DemoDay } from "@weyos/demo-fixtures";

import { LAYER_PILLAR, type PillarId } from "../theme/tokens";

export interface Tile {
  label: string;
  value: string;
  unit: string;
  detail: string;
  pillar: PillarId;
  unknown: boolean;
}

const round1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/** One sentence for Today. Follows the pack's verdict voice per state. */
export function headlineFor(day: DemoDay): string {
  switch (day.app_state) {
    case "calibrating":
      return "Still learning your baseline.";
    case "partial":
      return "In balance on what I can see.";
    case "in_balance":
      return "In balance today.";
    case "advisory":
      return "Tonight's plan changes.";
    case "intervention":
      return "Let's change tonight.";
    case "declined":
      return "Noted. Tonight stays as you planned.";
  }
}

/**
 * The line under the verdict.
 *
 * For `partial` it names what could not be checked. The pack is emphatic that "I could not
 * evaluate" must never look like "you are fine", so the absent signal is stated rather than
 * glossed.
 */
export function subFor(day: DemoDay): string | undefined {
  if (day.app_state === "partial") {
    const absent = absentLabels(day);
    return absent.length === 0
      ? "Some of today's readings haven't come through, so one rule couldn't be checked."
      : `${absent.join(" and ")} hasn't come through, so one rule couldn't be checked at all.`;
  }
  if (day.app_state === "in_balance") return "Nothing needs to change.";
  if (day.app_state === "calibrating") return "Your food profile is already guiding you.";
  return undefined;
}

function absentLabels(day: DemoDay): string[] {
  const b = day.snapshot.biometrics ?? {};
  const out: string[] = [];
  if (b.hrv_ms === null || b.hrv_ms === undefined) out.push("Your variability");
  if (b.sleep_deep_rem_pct === null || b.sleep_deep_rem_pct === undefined) out.push("Your sleep");
  if (b.wrist_temp_delta_c === null || b.wrist_temp_delta_c === undefined) {
    out.push("Your wrist temperature");
  }
  return out;
}

/** Signal tiles, pillar-coded per the pack: HRV air, resting HR fire, sleep ether, temp water. */
export function signalTilesFor(day: DemoDay): Tile[] {
  const b = day.snapshot.biometrics ?? {};
  const base = day.snapshot.baselines ?? {};

  const usual = (v: number | null | undefined, unit: string): string =>
    v === null || v === undefined ? "Baseline not ready yet" : `Your usual is ${round1(v)}${unit}`;

  const absent = (v: number | null | undefined): boolean => v === null || v === undefined;

  return [
    {
      label: "HRV",
      value: absent(b.hrv_ms) ? "" : round1(b.hrv_ms as number),
      unit: "ms",
      detail: absent(b.hrv_ms) ? "No reading today" : usual(base.hrv_ms, "ms"),
      pillar: "air",
      unknown: absent(b.hrv_ms),
    },
    {
      label: "Resting HR",
      value: absent(b.rhr_bpm) ? "" : round1(b.rhr_bpm as number),
      unit: "bpm",
      detail: absent(b.rhr_bpm) ? "No reading today" : usual(base.rhr_bpm, ""),
      pillar: "fire",
      unknown: absent(b.rhr_bpm),
    },
    {
      label: "Sleep",
      value: absent(b.sleep_deep_rem_pct) ? "" : round1(b.sleep_deep_rem_pct as number),
      unit: "%",
      detail: absent(b.sleep_deep_rem_pct)
        ? "No reading today"
        : usual(base.sleep_deep_rem_pct, "%"),
      pillar: "ether",
      unknown: absent(b.sleep_deep_rem_pct),
    },
    {
      label: "Wrist temp",
      value: absent(b.wrist_temp_delta_c)
        ? ""
        : `${(b.wrist_temp_delta_c as number) > 0 ? "+" : ""}${round1(b.wrist_temp_delta_c as number)}`,
      unit: "°C",
      detail: absent(b.wrist_temp_delta_c) ? "No reading today" : "Against your own baseline",
      pillar: "water",
      unknown: absent(b.wrist_temp_delta_c),
    },
  ];
}

/** Layer names as a user sees them. Rule ids stay in the collapsed technical block. */
export const LAYER_NAMES: Record<number, string> = {
  1: "Live biometrics",
  2: "Cycle phase",
  3: "Your food profile",
  4: "Season and surroundings",
  5: "Lab results",
};

export const layerPillar = (layer: number): PillarId => LAYER_PILLAR[layer] ?? "earth";
