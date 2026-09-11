import { Injectable, Logger } from "@nestjs/common";
import type { SignalSnapshot } from "@weyos/shared-schema";

import { SignalSnapshotRepository } from "../store/signal-snapshot.repository";

const WINDOW_DAYS = 14;

/**
 * Computes trailing-mean baselines from the subject's stored signal history.
 *
 * Option B (server-side computation): reads the last WINDOW_DAYS days from the
 * signal_snapshots hypertable, excluding the current day to avoid circular baselines.
 *
 * Option A fallback (transitional cold start): if fewer than 1 day of history exists
 * and the caller supplies client-computed baselines, those are used. This covers the
 * 0–13 day window while the server accumulates enough history to compute reliably.
 * Once history >= 1 day, Option B always wins.
 */
@Injectable()
export class BaselineComputationService {
  private readonly log = new Logger(BaselineComputationService.name);

  constructor(private readonly snapshots: SignalSnapshotRepository) {}

  async computeFor(
    subjectRef: string,
    asOf: string,
    coldStartFallback?: SignalSnapshot["baselines"],
  ): Promise<SignalSnapshot["baselines"]> {
    const rows = await this.snapshots.biometricHistoryForSubject(subjectRef, asOf, WINDOW_DAYS);

    if (rows.length === 0) {
      if (coldStartFallback) {
        this.log.log(
          `baseline cold-start fallback (Option A): subject=${subjectRef.slice(0, 8)} as_of=${asOf}`,
        );
        return coldStartFallback;
      }
      this.log.log(
        `baseline: no history, no fallback — dependent rules will be unevaluable: subject=${subjectRef.slice(0, 8)} as_of=${asOf}`,
      );
      return undefined;
    }

    const mean = (vals: (number | null)[]): number | null => {
      const nonNull = vals.filter((v): v is number => v !== null);
      return nonNull.length > 0 ? nonNull.reduce((a, b) => a + b, 0) / nonNull.length : null;
    };

    const baselines: SignalSnapshot["baselines"] = {
      hrv_ms: mean(rows.map((r) => r.hrv_ms)),
      rhr_bpm: mean(rows.map((r) => r.rhr_bpm)),
      sleep_deep_rem_pct: mean(rows.map((r) => r.sleep_deep_rem_pct)),
      days_of_history: rows.length,
      window_days: WINDOW_DAYS,
    };

    this.log.log(
      `baseline computed (Option B): subject=${subjectRef.slice(0, 8)} as_of=${asOf} days=${rows.length}`,
    );
    return baselines;
  }
}
