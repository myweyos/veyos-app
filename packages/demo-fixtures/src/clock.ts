/**
 * The deterministic day-clock, TypeScript side.
 *
 * Mirrors services/engine/demo_driver/clock.py exactly. Both implementations are pinned to
 * the committed `expected/` output, so a divergence fails a test rather than surfacing as a
 * demo that behaves differently on the phone than in the engine.
 *
 * It never reads wall time. `startDate` comes from a scenario file; `new Date()` with no
 * argument does not appear in this package.
 */

/**
 * Layer 2 covers cycle days 1-28 and nothing beyond. Day 29+ is UNDEFINED in the rulebook and
 * is on CLAUDE.md's do-not-resolve list, so the clock throws rather than wrapping to 1 and
 * quietly inventing an answer.
 */
export const CYCLE_MAX_DAY = 28;

export class UndefinedCycleDayError extends Error {
  constructor(day: number) {
    super(
      `scenario reached cycle_day ${day}; rulebook Layer 2 is undefined past day ` +
        `${CYCLE_MAX_DAY}. Patch \`cycle\` explicitly on that day and say what you intend — ` +
        `the clock will not wrap, because wrapping would answer an open spec question.`,
    );
    this.name = "UndefinedCycleDayError";
  }
}

/** Where a scenario has got to. Immutable, and carries no derived state. */
export interface DayClock {
  readonly scenarioId: string;
  readonly dayIndex: number;
}

export function createClock(scenarioId: string, dayIndex = 0): DayClock {
  if (dayIndex < 0) throw new RangeError(`dayIndex must be >= 0, got ${dayIndex}`);
  return { scenarioId, dayIndex };
}

export function advance(clock: DayClock, days = 1): DayClock {
  return createClock(clock.scenarioId, clock.dayIndex + days);
}

export function reset(clock: DayClock): DayClock {
  return createClock(clock.scenarioId, 0);
}

/** ISO date `dayIndex` days after the scenario's start. Pure — no wall clock. */
export function asOfFor(startDate: string, dayIndex: number): string {
  const parsed = Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new RangeError(`start_date is not an ISO date: ${startDate}`);
  const shifted = new Date(parsed + dayIndex * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Advance the cycle day, or refuse.
 *
 * Returns null for a subject with no cycle tracking — which is a different thing from day
 * zero, and which the engine treats as UNKNOWN rather than false.
 */
export function cycleDayFor(startCycleDay: number | null, dayIndex: number): number | null {
  if (startCycleDay === null) return null;
  const day = startCycleDay + dayIndex;
  if (day > CYCLE_MAX_DAY) throw new UndefinedCycleDayError(day);
  return day;
}
