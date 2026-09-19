import { api } from "./api";
import { cycleFor, loadCycle, saveCycle, withPeriodStart } from "./cycle";
import { deviceTimeZone, recentDays } from "./dates";
import { deviceStore } from "./deviceStore";
import { grantedTypes, latestPeriodStart, readDay, type DayReadings } from "./healthConnect";

/**
 * Health Connect → Weyos API.
 *
 * Days are sent oldest first, because each ingest computes baselines from the days stored
 * before it. The first sync backfills 30 days: Health Connect only lets an app read data from
 * up to 30 days before it was first granted access, and the engine needs 28 days of history
 * before it trusts a baseline, so backfill is what gets a new subject out of Calibrating on
 * day one rather than in a month.
 *
 * Later syncs resend the last 3 days, because wearables often deliver overnight data late.
 * Re-sending a day is safe: ingestion merges per (subject, day), and the decision id is a
 * content hash, so an unchanged day produces the same decision.
 */
const FIRST_SYNC_DAYS = 30;
const RESYNC_DAYS = 3;
const SYNCED_KEY = "weyos.sync.first-done.v1";

export interface SyncResult {
  sent: number;
  empty: number;
}

function hasAnyReading(r: DayReadings): boolean {
  return r.hrv_rmssd_ms !== null || r.rhr_bpm !== null || r.sleep_stages !== null || r.steps !== null;
}

export async function sync(options: { cycleConsent: boolean }): Promise<SyncResult> {
  const granted = await grantedTypes();
  const firstDone = (await deviceStore.getItem(SYNCED_KEY)) === "1";
  const days = recentDays(firstDone ? RESYNC_DAYS : FIRST_SYNC_DAYS);

  let cycle = await loadCycle();
  if (options.cycleConsent && cycle.tracking && granted.has("MenstruationPeriod")) {
    cycle = withPeriodStart(cycle, await latestPeriodStart());
    await saveCycle(cycle);
  }

  const timezone = deviceTimeZone();
  const capturedAt = new Date().toISOString();
  let sent = 0;
  let empty = 0;
  for (const day of days) {
    const readings = await readDay(day, granted);
    if (!hasAnyReading(readings)) {
      empty++;
      continue;
    }
    const cycleSection = options.cycleConsent ? cycleFor(day, cycle) : undefined;
    await api.ingest({
      // subject_ref and constitution are set by the API from the token and the profile.
      vendor_format: "health_connect",
      as_of: day,
      ...(timezone !== undefined && { timezone }),
      ...readings,
      ...(cycleSection !== undefined && { cycle: cycleSection }),
      captured_at: capturedAt,
    });
    sent++;
  }
  if (!firstDone && sent > 0) await deviceStore.setItem(SYNCED_KEY, "1");
  return { sent, empty };
}

/** Forget sync progress, e.g. after the account is deleted. */
export async function resetSync(): Promise<void> {
  await deviceStore.deleteItem(SYNCED_KEY);
}
