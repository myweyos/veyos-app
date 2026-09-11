import { BadRequestException, Body, Controller, HttpCode, Post } from "@nestjs/common";
import type { SignalSnapshot } from "@weyos/shared-schema";

import { EngineClient } from "../engine/engine.client";
import { DecisionRepository } from "../store/decision.repository";
import { SignalSnapshotRepository } from "../store/signal-snapshot.repository";
import { SnapshotValidator } from "./snapshot.validator";

/**
 * Ingestion boundary.
 *
 * Everything that enters the system passes through here and is validated against the
 * published JSON Schema BEFORE it touches storage or the engine. Two reasons that matters
 * more than usual on this project:
 *
 *  1. The engine is deterministic and assumes well-formed input. Garbage in produces
 *     confidently wrong health advice out — the worst failure mode this product has.
 *  2. This is Art.9 special-category data. An unvalidated field that slips through here
 *     ends up in a store we then have to justify to a regulator.
 *
 * Persistence order (SCRUM-72):
 *   validate → upsert snapshot → call engine → persist decision → return decision_id
 *
 * The snapshot is persisted BEFORE the engine call so that if the engine fails the payload
 * is not lost and can be retried. If the decision persist fails after the engine call, the
 * snapshot is stored and a retry will produce the same decision_id (content-addressed,
 * ADR 0006) — ON CONFLICT DO NOTHING makes the re-insert safe.
 */
@Controller("v1/ingest")
export class IngestionController {
  constructor(
    private readonly validator: SnapshotValidator,
    private readonly engine: EngineClient,
    private readonly snapshots: SignalSnapshotRepository,
    private readonly decisions: DecisionRepository,
  ) {}

  @Post("snapshot")
  @HttpCode(202)
  async ingest(@Body() body: unknown): Promise<{ accepted: true; decision_id: string }> {
    const result = this.validator.validate(body);
    if (!result.ok) {
      // Deliberately returns field paths and rule messages, never the offending VALUES —
      // error payloads get logged and we do not log biometrics.
      throw new BadRequestException({
        message: "snapshot failed schema validation",
        errors: result.errors,
      });
    }

    const snapshot: SignalSnapshot = result.value;

    // Persist before dispatch — a failed engine call leaves the snapshot available for retry.
    await this.snapshots.upsert(snapshot);

    // ADR 0004: EngineClient is the seam that becomes a queue publisher when option 2 lands.
    const envelope = await this.engine.decide(snapshot);

    // decision_id is content-addressed (ADR 0006); ON CONFLICT DO NOTHING makes retries safe.
    await this.decisions.save(envelope);

    return { accepted: true, decision_id: envelope.decision_id };
  }
}
