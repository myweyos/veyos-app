/**
 * Web variant of healthConnect: there are no health signals in a browser.
 *
 * Signals reach Weyos from the phone app, which reads Health Connect and sends each day to
 * the API. The web app reads the decisions the engine already made from those days; it never
 * reads a sensor and never sends a snapshot. Every function here says so rather than
 * pretending, and `availability()` returning "web" is what the connect step and Settings key
 * their copy on.
 */
import type { DayReadings } from "./healthConnect";

export type { DayReadings } from "./healthConnect";
export type Availability = "available" | "update_required" | "unavailable" | "not_android" | "web";

export async function availability(): Promise<Availability> {
  return "web";
}

export async function connect(_includeCycle: boolean): Promise<Set<string>> {
  throw new Error("health_connect_unavailable");
}

export async function grantedTypes(): Promise<Set<string>> {
  return new Set();
}

export function openHealthConnectSettings(): void {
  // Nothing to open on the web.
}

export async function readDay(_day: string, _granted: Set<string>): Promise<DayReadings> {
  throw new Error("health_connect_unavailable");
}

export async function latestPeriodStart(_now: Date = new Date()): Promise<Date | null> {
  return null;
}
