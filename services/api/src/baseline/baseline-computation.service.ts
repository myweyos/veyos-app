import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { SignalSnapshot } from "@weyos/shared-schema";
import type Redis from "ioredis";

import { REDIS_CLIENT } from "../redis/redis.tokens";
import { SignalSnapshotRepository } from "../store/signal-snapshot.repository";

const WINDOW_DAYS = 14;
const BASELINE_TTL_S = 82_800; // 23 h — under the 24 h decision TTL to avoid stale baselines

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
 *
 * Redis caching (SCRUM-73): computed baselines are cached with a 23 h TTL. The cache is
 * invalidated explicitly via invalidate() before each ingest so that the computation that
 * immediately follows always reflects the freshly written snapshot row.
 */
@Injectable()
export class BaselineComputationService {
  private readonly log = new Logger(BaselineComputationService.name);

  constructor(
    private readonly snapshots: SignalSnapshotRepository,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async computeFor(
    subjectRef: string,
    asOf: string,
    coldStartFallback?: SignalSnapshot["baselines"],
  ): Promise<SignalSnapshot["baselines"]> {
    if (this.redis !== undefined) {
      const raw = await this.redis.get(this.cacheKey(subjectRef, asOf));
      if (raw !== null) {
        this.log.debug(
          `baseline cache hit: subject=${subjectRef.slice(0, 8)} as_of=${asOf}`,
        );
        return JSON.parse(raw) as SignalSnapshot["baselines"];
      }
    }

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

    await this.writeCache(subjectRef, asOf, baselines);
    return baselines;
  }

  /**
   * Invalidates the cached baseline for (subjectRef, asOf).
   *
   * Must be called after SignalSnapshotRepository.upsert() so the next computeFor()
   * always reads from Postgres and reflects the newly written row.
   */
  async invalidate(subjectRef: string, asOf: string): Promise<void> {
    if (this.redis === undefined) return;
    try {
      await this.redis.del(this.cacheKey(subjectRef, asOf));
    } catch (err) {
      this.log.warn(
        `baseline cache invalidation failed: subject=${subjectRef.slice(0, 8)} as_of=${asOf}: ${String(err)}`,
      );
    }
  }

  private async writeCache(
    subjectRef: string,
    asOf: string,
    baselines: SignalSnapshot["baselines"],
  ): Promise<void> {
    if (this.redis === undefined) return;
    try {
      await this.redis.set(
        this.cacheKey(subjectRef, asOf),
        JSON.stringify(baselines),
        "EX",
        BASELINE_TTL_S,
      );
    } catch (err) {
      this.log.warn(
        `baseline cache write failed: subject=${subjectRef.slice(0, 8)} as_of=${asOf}: ${String(err)}`,
      );
    }
  }

  private cacheKey(subjectRef: string, asOf: string): string {
    return `baseline:${subjectRef}:${asOf}`;
  }
}
