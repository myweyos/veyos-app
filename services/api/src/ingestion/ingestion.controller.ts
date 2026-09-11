import { BadRequestException, Body, Controller, HttpCode, Post } from "@nestjs/common";
import type { SignalSnapshot } from "@weyos/shared-schema";

import { BaselineComputationService } from "../baseline/baseline-computation.service";
import { EngineClient } from "../engine/engine.client";
import { NormalisationService } from "../normalisation/normalisation.service";
import type { IngestPayload } from "../normalisation/vendor-types";
import { DecisionRepository } from "../store/decision.repository";
import { SignalSnapshotRepository } from "../store/signal-snapshot.repository";
import { SnapshotValidator } from "./snapshot.validator";

/**
 * Ingestion boundary.
 *
 * Everything that enters the system passes through here. Pipeline:
 *
 *   normalise → validate → upsert → compute baselines → inject baselines → decide → persist
 *
 * Normalise (SCRUM-71): vendor shapes (HealthKit, Health Connect, BLE) are converted to
 * the canonical SignalSnapshot and, when a snapshot already exists for the same
 * (subject_ref, as_of), merged field-by-field using source priority (BLE > HK > HC > manual).
 * Canonical payloads (no vendor_format) bypass normalisation — preserves test paths.
 *
 * Validate: AJV against signal-snapshot.schema.json. Error paths return field paths and
 * rule messages only — never the offending values — because error payloads are logged and
 * we do not log biometrics.
 *
 * Baselines (SCRUM-71): computed server-side from the 14-day rolling history after the
 * snapshot is persisted. Cold-start fallback uses client-sent baselines when fewer than 1
 * day of history is available (Option A transitional, per the SCRUM-71 plan). Baselines
 * are injected in-memory only; the stored snapshot_json does not include them (they are
 * reproducible from the stored history and recomputed on every ingest).
 *
 * Persistence order (SCRUM-72): validate → upsert snapshot → compute baselines → call
 * engine → persist decision. The snapshot is persisted BEFORE the engine call so that if
 * the engine fails the payload is not lost and can be retried. If the decision persist
 * fails after the engine call, a retry will produce the same decision_id (content-addressed,
 * ADR 0006) — ON CONFLICT DO NOTHING makes the re-insert safe.
 */
@Controller("v1/ingest")
export class IngestionController {
  constructor(
    private readonly normaliser: NormalisationService,
    private readonly validator: SnapshotValidator,
    private readonly engine: EngineClient,
    private readonly snapshots: SignalSnapshotRepository,
    private readonly decisions: DecisionRepository,
    private readonly baselines: BaselineComputationService,
  ) {}

  @Post("snapshot")
  @HttpCode(202)
  async ingest(@Body() body: unknown): Promise<{ accepted: true; decision_id: string }> {
    // Step 1: normalise vendor payload → canonical SignalSnapshot (or pass-through)
    const normalised = await this.normaliser.normalise(body as IngestPayload);

    // Step 2: validate canonical shape before touching storage
    const result = this.validator.validate(normalised);
    if (!result.ok) {
      throw new BadRequestException({
        message: "snapshot failed schema validation",
        errors: result.errors,
      });
    }

    const snapshot: SignalSnapshot = result.value;

    // Step 3: persist before dispatch — a failed engine call leaves the snapshot for retry
    await this.snapshots.upsert(snapshot);

    // Step 4: compute baselines from DB history (Option B); fall back to client-sent if
    // cold start (Option A). snapshot.baselines carries the Option-A value when present.
    const computedBaselines = await this.baselines.computeFor(
      snapshot.subject_ref,
      snapshot.as_of,
      snapshot.baselines,
    );

    // Step 5: inject baselines in-memory — NOT re-persisted to DB
    const snapshotWithBaselines: SignalSnapshot = computedBaselines
      ? { ...snapshot, baselines: computedBaselines }
      : snapshot;

    // Step 6: ADR 0004 — EngineClient is the seam for a future queue publisher
    const envelope = await this.engine.decide(snapshotWithBaselines);

    // Step 7: decision_id is content-addressed (ADR 0006); ON CONFLICT DO NOTHING on retry
    await this.decisions.save(envelope);

    return { accepted: true, decision_id: envelope.decision_id };
  }
}
