import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import type { Decision, SignalSnapshot } from "@weyos/shared-schema";

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
 * decision id rather than computing inline. Inline is fine while the engine is <5ms.
 */
@Controller("v1/ingest")
export class IngestionController {
  constructor(private readonly validator: SnapshotValidator) {}

  @Post("snapshot")
  async ingest(@Body() body: unknown): Promise<{ accepted: true; decision: Decision | null }> {
    const result = this.validator.validate(body);
    if (!result.ok) {
      // Deliberately returns field paths and rule messages, never the offending VALUES —
      // error payloads get logged and we do not log biometrics.
      throw new BadRequestException({ message: "snapshot failed schema validation", errors: result.errors });
    }

    const snapshot: SignalSnapshot = result.value;
    void snapshot;

    // TODO(VEY-ENGINE-1): call the Python engine. Decision: in-process via a sidecar HTTP
    // call, or a queue? See docs/adr/0004-engine-invocation.md — UNDECIDED, do not guess.
    return { accepted: true, decision: null };
  }
}
