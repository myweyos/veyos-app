import { Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import type { DecisionEnvelope, SignalSnapshot } from "@weyos/shared-schema";
import type Redis from "ioredis";

import { BaselineComputationService } from "../baseline/baseline-computation.service";
import { REDIS_CLIENT } from "../redis/redis.tokens";
import { DecisionRepository } from "../store/decision.repository";
import { SignalSnapshotRepository } from "../store/signal-snapshot.repository";

const DECISION_TTL_S = 86_400; // 24 h

/**
 * The read side: a subject's decisions, as ingestion stored them.
 *
 * Nothing here calls the engine. A decision is computed exactly once, at ingest, with the
 * server-computed baselines, and persisted. Every read serves that stored envelope, so
 * `/decision/today`, `/plan`, `/meal` and the trace can never disagree with each other or with
 * what the subject was told. Recomputing on read without the same baselines would give a
 * different answer, which is the bug the previous persona-backed path had.
 *
 * Every method takes the authenticated subject_ref and returns only that subject's data. A
 * decision id belonging to someone else is a 404, not a 403: it doesn't reveal that it exists.
 */
@Injectable()
export class DecisionService {
  private readonly log = new Logger(DecisionService.name);

  constructor(
    private readonly decisions: DecisionRepository,
    private readonly snapshots: SignalSnapshotRepository,
    private readonly baselines: BaselineComputationService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async today(subjectRef: string): Promise<DecisionEnvelope> {
    const envelope = await this.decisions.latestForSubject(subjectRef);
    if (envelope === null) throw new NotFoundException({ error: "no_decision_yet" });
    return envelope;
  }

  /**
   * Look up one of this subject's decisions by id.
   *
   * Redis first (recent decisions, survives restarts and horizontal scaling), then Postgres.
   */
  async byDecisionId(id: string, subjectRef: string): Promise<DecisionEnvelope> {
    const envelope = (await this.fromCache(id)) ?? (await this.decisions.findById(id));
    if (envelope === null || envelope.decision.subject_ref !== subjectRef) {
      throw new NotFoundException({ error: "unknown_decision" });
    }
    await this.cacheDecision(envelope);
    return envelope;
  }

  /** The snapshot a decision was computed from. `/v1/signals` needs it; a Decision has no readings. */
  async snapshotFor(subjectRef: string, asOf: string): Promise<SignalSnapshot | null> {
    return this.snapshots.latestForSubject(subjectRef, asOf);
  }

  /** The baselines ingestion computed for that day: same history, same function, same result. */
  async baselinesFor(subjectRef: string, asOf: string): Promise<SignalSnapshot["baselines"]> {
    return this.baselines.computeFor(subjectRef, asOf);
  }

  /** Cache a freshly computed or retrieved envelope — fire-and-forget, never throws. */
  async cacheDecision(envelope: DecisionEnvelope): Promise<void> {
    if (this.redis === undefined) return;
    try {
      await this.redis.set(
        this.decisionKey(envelope.decision_id),
        JSON.stringify(envelope),
        "EX",
        DECISION_TTL_S,
      );
    } catch (err) {
      // Cache write failures are not fatal — the source of truth is Postgres.
      this.log.warn(`decision cache write failed for ${envelope.decision_id}: ${String(err)}`);
    }
  }

  private async fromCache(id: string): Promise<DecisionEnvelope | null> {
    if (this.redis === undefined) return null;
    try {
      const raw = await this.redis.get(this.decisionKey(id));
      return raw === null ? null : (JSON.parse(raw) as DecisionEnvelope);
    } catch {
      return null; // A cache that can't answer is a miss, not an outage.
    }
  }

  private decisionKey(id: string): string {
    return `decision:${id}`;
  }
}
