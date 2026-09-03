import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import type { DecisionEnvelope, SignalSnapshot } from "@weyos/shared-schema";

import { EngineClient } from "../engine/engine.client";
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
 * TODO(VEY-INGEST-2): persist to Timescale, enqueue for the engine, return 202 with a
 * decision id rather than computing inline. Inline is fine while the engine is <5ms — see
 * ADR 0004, which sequences the queue for when the execution layer lands.
 */
@Controller("v1/ingest")
export class IngestionController {
  constructor(
    private readonly validator: SnapshotValidator,
    private readonly engine: EngineClient,
  ) {}

  @Post("snapshot")
  async ingest(@Body() body: unknown): Promise<{ accepted: true; decision: DecisionEnvelope }> {
    const result = this.validator.validate(body);
    if (!result.ok) {
      // Deliberately returns field paths and rule messages, never the offending VALUES —
      // error payloads get logged and we do not log biometrics.
      throw new BadRequestException({ message: "snapshot failed schema validation", errors: result.errors });
    }

    const snapshot: SignalSnapshot = result.value;

    // VEY-ENGINE-1, resolved. ADR 0004 chose a FastAPI sidecar; EngineClient is the seam that
    // becomes a queue publisher when option 2 lands, without moving this controller.
    const decision = await this.engine.decide(snapshot);
    return { accepted: true, decision };
  }
}
