import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import type Redis from "ioredis";

import { REDIS_CLIENT } from "../redis/redis.tokens";

export const DECISIONS_QUEUE_NAME = "decisions";

export interface DecisionJobData {
  decision_id: string;
}

/**
 * BullMQ queue scaffolding for the execution layer.
 *
 * After each successful ingest, the decision_id is enqueued here. The queue is currently
 * consumed by a stub worker that logs the id — a placeholder for the exactly-once
 * delivery, state machine, APNs/FCM and quiet-hours logic described in ADR 0004 §option-2
 * and the SCRUM-75 execution layer.
 *
 * Enqueue is fire-and-forget: a failure to enqueue does NOT fail the HTTP response because
 * the decision is already persisted to Postgres. The execution layer will pick it up via
 * a polling recovery path when that phase lands.
 *
 * TODO(SCRUM-75): replace the stub worker with the real execution layer.
 */
@Injectable()
export class DecisionsQueue implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DecisionsQueue.name);
  private queue: Queue<DecisionJobData> | undefined;
  private worker: Worker<DecisionJobData> | undefined;

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  onModuleInit(): void {
    if (this.redis === undefined) return;

    // BullMQ requires an ioredis-compatible connection; pass the existing client options.
    // BullMQ manages its own internal connections from the connection config.
    const connection = this.redis;

    this.queue = new Queue<DecisionJobData>(DECISIONS_QUEUE_NAME, { connection });

    // Stub worker — logs decision_id only, no biometrics.
    this.worker = new Worker<DecisionJobData>(
      DECISIONS_QUEUE_NAME,
      async (job) => {
        this.log.log(`[execution-stub] decision queued: ${job.data.decision_id}`);
      },
      { connection },
    );

    this.worker.on("failed", (job, err) => {
      this.log.warn(
        `[execution-stub] job failed: ${job?.data.decision_id ?? "unknown"}: ${String(err)}`,
      );
    });

    this.log.log("decisions queue and stub worker initialised");
  }

  /**
   * Enqueue a decision_id for the execution layer.
   * Fire-and-forget — failures are logged but never propagated to the caller.
   */
  async enqueue(decisionId: string): Promise<void> {
    if (this.queue === undefined) return;
    try {
      await this.queue.add("dispatch", { decision_id: decisionId });
      this.log.debug(`enqueued decision: ${decisionId}`);
    } catch (err) {
      // Decision is in Postgres — the execution layer will recover.
      this.log.warn(`failed to enqueue decision ${decisionId}: ${String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
