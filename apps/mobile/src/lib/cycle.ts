import { daysBetween, localDate } from "./dates";
import { deviceStore } from "./deviceStore";

/**
 * Cycle setup (design pack A6), kept on the device (deviceStore).
 *
 * The subject gives the first day of their last period and a typical length. Health Connect
 * menstruation records, when granted, update the start date. Nothing here guesses a phase.
 */
export interface CycleSettings {
  tracking: boolean;
  lastPeriodStart: string | null; // YYYY-MM-DD
  cycleLength: number | null; // 20–45, per the snapshot schema
}

const KEY = "weyos.cycle.v1";
const OFF: CycleSettings = { tracking: false, lastPeriodStart: null, cycleLength: null };

export async function loadCycle(): Promise<CycleSettings> {
  const raw = await deviceStore.getItem(KEY);
  if (raw === null) return OFF;
  try {
    return { ...OFF, ...(JSON.parse(raw) as Partial<CycleSettings>) };
  } catch {
    return OFF;
  }
}

export async function saveCycle(settings: CycleSettings): Promise<void> {
  await deviceStore.setItem(KEY, JSON.stringify(settings));
}

export async function clearCycle(): Promise<void> {
  await deviceStore.deleteItem(KEY);
}

/**
 * The snapshot's `cycle` section for `day`, or undefined when there is nothing to send.
 *
 * cycle_day counts from the last period start and deliberately does NOT wrap at the cycle
 * length. A day past 28 is an open spec question (CLAUDE.md), and the engine answers it with
 * an UNDEFINED warning. Wrapping here would resolve it silently on the device.
 */
export function cycleFor(day: string, settings: CycleSettings): Record<string, unknown> | undefined {
  if (!settings.tracking || settings.lastPeriodStart === null) return undefined;
  if (day < settings.lastPeriodStart) return undefined;
  return {
    cycle_day: daysBetween(settings.lastPeriodStart, day) + 1,
    cycle_length: settings.cycleLength,
    tracked: true,
  };
}

/** Adopt a later period start from Health Connect. Never moves the date backwards. */
export function withPeriodStart(settings: CycleSettings, start: Date | null): CycleSettings {
  if (start === null) return settings;
  const iso = localDate(start);
  if (settings.lastPeriodStart !== null && iso <= settings.lastPeriodStart) return settings;
  return { ...settings, lastPeriodStart: iso };
}
