/**
 * Copy and signal presentation.
 *
 * Two constraints bind everything here.
 *
 * BANNED VOCABULARY. Never: detect, diagnose, risk, prevent, treat, symptom, condition,
 * disorder, abnormal, medical, cardiac, patient, prescribe. Never, for tone: should, must,
 * failed, missed, streak. Note `prescribed` is a FIELD NAME on the Decision — it is data and
 * must never reach a user-facing string. tools/copy-lint enforces this in CI.
 *
 * NO RULE LOGIC OUTSIDE THE ENGINE. Nothing here compares a reading to a threshold or
 * computes a deviation. Tiles show the reading and the subject's usual value as two plain
 * facts; the delta the engine actually used is already prose inside fired_rules[].because.
 */

import type { AppStateId } from "@weyos/app-state";

import type { TodayModel } from "../lib/todayModel";
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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "Wednesday 19 August" — the pack's UK `datestr()`.
 *
 * Parsed as UTC so the rendered date is the decision's `as_of`, not whatever the device's
 * timezone would shift it to. US formatting ("Wednesday, August 19") is region-dependent and
 * belongs with the region work in A3; not implemented here rather than guessed at.
 */
export function longDate(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

type Biometrics = NonNullable<NonNullable<TodayModel["snapshot"]>["biometrics"]>;

const biometricsOf = (model: TodayModel): Partial<Biometrics> => model.snapshot?.biometrics ?? {};
const missing = (v: unknown): boolean => v === null || v === undefined;

function absentLabels(model: TodayModel): string[] {
  const b = biometricsOf(model);
  const out: string[] = [];
  if (missing(b.hrv_ms)) out.push("Your variability");
  if (missing(b.sleep_deep_rem_pct)) out.push("Your sleep");
  if (missing(b.wrist_temp_delta_c)) out.push("Your wrist temperature");
  return out;
}

/**
 * The Partial state's warn-box sentence.
 *
 * Names what could not be checked, and says plainly that this is not reassurance. The pack's
 * copy is the model: "with no wrist temperature, I can't check your immune and inflammatory
 * rule either way — so I'm not telling you you're fine."
 */
export function unevaluableSentence(model: TodayModel): string {
  const absent = absentLabels(model);
  const what = absent.length === 0 ? "One of your signals" : absent.join(" and ");
  return (
    `${what} hasn't come through today, so a rule that needs it couldn't be checked ` +
    `either way — I'm not telling you you're fine.`
  );
}

/** One sentence for Today. Follows the pack's verdict voice per state. */
export function headlineFor(state: AppStateId): string {
  switch (state) {
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

/** The line under the verdict. For `partial` it names what could not be checked. */
export function subFor(model: TodayModel): string | undefined {
  if (model.appState === "partial") {
    const absent = absentLabels(model);
    return absent.length === 0
      ? "Some of today's readings haven't come through, so one rule couldn't be checked."
      : `${absent.join(" and ")} hasn't come through, so one rule couldn't be checked at all.`;
  }
  if (model.appState === "in_balance") return "Nothing needs to change.";
  if (model.appState === "calibrating") return "Your food profile is already guiding you.";
  return undefined;
}

/** Signal tiles, pillar-coded per the pack: HRV air, resting HR fire, sleep ether, temp water. */
export function signalTilesFor(model: TodayModel): Tile[] {
  const b = biometricsOf(model);
  const base = model.snapshot?.baselines ?? {};
  const fromHealthConnect = b.source === "health_connect";

  const usual = (v: number | null | undefined, unit: string): string =>
    missing(v) ? "Baseline not ready yet" : `Your usual is ${round1(v as number)}${unit}`;

  return [
    {
      label: "HRV",
      value: missing(b.hrv_ms) ? "" : round1(b.hrv_ms as number),
      unit: "ms",
      detail: missing(b.hrv_ms) ? "No reading today" : usual(base.hrv_ms, "ms"),
      pillar: "air",
      unknown: missing(b.hrv_ms),
    },
    {
      label: "Resting HR",
      value: missing(b.rhr_bpm) ? "" : round1(b.rhr_bpm as number),
      unit: "bpm",
      detail: missing(b.rhr_bpm) ? "No reading today" : usual(base.rhr_bpm, ""),
      pillar: "fire",
      unknown: missing(b.rhr_bpm),
    },
    {
      label: "Sleep",
      value: missing(b.sleep_deep_rem_pct) ? "" : round1(b.sleep_deep_rem_pct as number),
      unit: "%",
      detail: missing(b.sleep_deep_rem_pct)
        ? "No sleep stages today"
        : usual(base.sleep_deep_rem_pct, "%"),
      pillar: "ether",
      unknown: missing(b.sleep_deep_rem_pct),
    },
    {
      label: "Wrist temp",
      value: missing(b.wrist_temp_delta_c)
        ? ""
        : `${(b.wrist_temp_delta_c as number) > 0 ? "+" : ""}${round1(b.wrist_temp_delta_c as number)}`,
      unit: "°C",
      detail: missing(b.wrist_temp_delta_c)
        ? fromHealthConnect
          ? "Health Connect doesn't provide this"
          : "No reading today"
        : "Against your own baseline",
      pillar: "water",
      unknown: missing(b.wrist_temp_delta_c),
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
