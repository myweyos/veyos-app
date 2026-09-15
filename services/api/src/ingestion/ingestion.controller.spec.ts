import { BadRequestException } from "@nestjs/common";
import type { DecisionEnvelope, SignalSnapshot } from "@weyos/shared-schema";

import type { BaselineComputationService } from "../baseline/baseline-computation.service";
import type { DecisionsQueue } from "../decisions-queue/decisions.queue";
import type { EngineClient } from "../engine/engine.client";
import type { NormalisationService } from "../normalisation/normalisation.service";
import type { DecisionRepository } from "../store/decision.repository";
import type { SignalSnapshotRepository } from "../store/signal-snapshot.repository";
import { IngestionController } from "./ingestion.controller";
import type { SnapshotValidator } from "./snapshot.validator";

function makeSnapshot(): SignalSnapshot {
  return {
    schema_version: 1,
    subject_ref: "sub_test_001",
    as_of: "2026-09-11",
    constitution: { dosha: "vata" },
  };
}

function makeEnvelope(): DecisionEnvelope {
  return { decision_id: "abcd1234efgh5678" } as unknown as DecisionEnvelope;
}

/** Default normaliser: pass-through (no vendor conversion needed for these tests). */
function makeNormaliser(snapshot = makeSnapshot()): jest.Mocked<Pick<NormalisationService, "normalise">> {
  return { normalise: jest.fn().mockResolvedValue(snapshot) };
}

/** Default baselines: undefined (cold start, no history). */
function makeBaselines(): jest.Mocked<Pick<BaselineComputationService, "computeFor" | "invalidate">> {
  return {
    computeFor: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn().mockResolvedValue(undefined),
  };
}

function makeController({
  validationResult = { ok: true as const, value: makeSnapshot() },
  envelope = makeEnvelope(),
  upsert = jest.fn().mockResolvedValue(undefined),
  save = jest.fn().mockResolvedValue(undefined),
  queue,
}: {
  validationResult?: { ok: true; value: SignalSnapshot } | { ok: false; errors: string[] };
  envelope?: DecisionEnvelope;
  upsert?: jest.Mock;
  save?: jest.Mock;
  queue?: jest.Mocked<Pick<DecisionsQueue, "enqueue">> | undefined;
} = {}) {
  const normaliser = makeNormaliser(validationResult.ok ? validationResult.value : makeSnapshot());
  const baselines = makeBaselines();
  const validator: jest.Mocked<Pick<SnapshotValidator, "validate">> = {
    validate: jest.fn().mockReturnValue(validationResult),
  };
  const engine: jest.Mocked<Pick<EngineClient, "decide">> = {
    decide: jest.fn().mockResolvedValue(envelope),
  };
  const snapshots: jest.Mocked<Pick<SignalSnapshotRepository, "upsert">> = { upsert };
  const decisions: jest.Mocked<Pick<DecisionRepository, "save">> = { save };

  const controller = new IngestionController(
    normaliser as unknown as NormalisationService,
    validator as unknown as SnapshotValidator,
    engine as unknown as EngineClient,
    snapshots as unknown as SignalSnapshotRepository,
    decisions as unknown as DecisionRepository,
    baselines as unknown as BaselineComputationService,
    queue as unknown as DecisionsQueue | undefined,
  );

  return { controller, normaliser, validator, engine, snapshots, decisions, baselines, queue };
}

describe("IngestionController.ingest()", () => {
  it("returns {accepted:true, decision_id} — not the full envelope", async () => {
    const { controller } = makeController();
    const result = await controller.ingest({});
    expect(result).toEqual({ accepted: true, decision_id: "abcd1234efgh5678" });
  });

  it("persists the snapshot BEFORE calling the engine", async () => {
    // Invariant: if the engine call fails, the snapshot must already be stored so the
    // client can retry. This test verifies that ordering is not just a comment.
    const callOrder: string[] = [];

    const upsert = jest.fn().mockImplementation(() => {
      callOrder.push("upsert");
      return Promise.resolve();
    });
    const engine: jest.Mocked<Pick<EngineClient, "decide">> = {
      decide: jest.fn().mockImplementation(() => {
        callOrder.push("engine");
        return Promise.resolve(makeEnvelope());
      }),
    };

    const controller = new IngestionController(
      makeNormaliser() as unknown as NormalisationService,
      { validate: jest.fn().mockReturnValue({ ok: true, value: makeSnapshot() }) } as unknown as SnapshotValidator,
      engine as unknown as EngineClient,
      { upsert } as unknown as SignalSnapshotRepository,
      { save: jest.fn().mockResolvedValue(undefined) } as unknown as DecisionRepository,
      makeBaselines() as unknown as BaselineComputationService,
    );

    await controller.ingest({});

    expect(callOrder).toEqual(["upsert", "engine"]);
  });

  it("saves the decision envelope after the engine call", async () => {
    const { controller, engine, decisions } = makeController();
    await controller.ingest({});

    // engine.decide must have been called before decisions.save
    const engineOrder = (engine.decide as jest.Mock).mock.invocationCallOrder[0]!;
    const saveOrder = (decisions.save as jest.Mock).mock.invocationCallOrder[0]!;
    expect(engineOrder).toBeLessThan(saveOrder);
  });

  it("throws BadRequestException on invalid snapshot — no DB writes occur", async () => {
    const upsert = jest.fn();
    const save = jest.fn();
    const { controller } = makeController({
      validationResult: { ok: false, errors: ["/hrv_ms failed 'type'"] },
      upsert,
      save,
    });

    await expect(controller.ingest({})).rejects.toThrow(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("propagates an engine error after the snapshot has been persisted", async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const engine: jest.Mocked<Pick<EngineClient, "decide">> = {
      decide: jest.fn().mockRejectedValue(new Error("engine timeout")),
    };

    const controller = new IngestionController(
      makeNormaliser() as unknown as NormalisationService,
      { validate: jest.fn().mockReturnValue({ ok: true, value: makeSnapshot() }) } as unknown as SnapshotValidator,
      engine as unknown as EngineClient,
      { upsert } as unknown as SignalSnapshotRepository,
      { save: jest.fn() } as unknown as DecisionRepository,
      makeBaselines() as unknown as BaselineComputationService,
    );

    await expect(controller.ingest({})).rejects.toThrow("engine timeout");
    // Snapshot was already persisted before the engine was called
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("invalidates the baseline cache after upsert and before computeFor", async () => {
    const callOrder: string[] = [];
    const upsert = jest.fn().mockImplementation(() => { callOrder.push("upsert"); return Promise.resolve(); });
    const invalidate = jest.fn().mockImplementation(() => { callOrder.push("invalidate"); return Promise.resolve(); });
    const computeFor = jest.fn().mockImplementation(() => { callOrder.push("computeFor"); return Promise.resolve(undefined); });

    const controller = new IngestionController(
      makeNormaliser() as unknown as NormalisationService,
      { validate: jest.fn().mockReturnValue({ ok: true, value: makeSnapshot() }) } as unknown as SnapshotValidator,
      { decide: jest.fn().mockResolvedValue(makeEnvelope()) } as unknown as EngineClient,
      { upsert } as unknown as SignalSnapshotRepository,
      { save: jest.fn().mockResolvedValue(undefined) } as unknown as DecisionRepository,
      { computeFor, invalidate } as unknown as BaselineComputationService,
    );

    await controller.ingest({});

    expect(callOrder).toEqual(["upsert", "invalidate", "computeFor"]);
  });

  it("enqueues the decision_id after a successful ingest (fire-and-forget)", async () => {
    const queue: jest.Mocked<Pick<DecisionsQueue, "enqueue">> = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };
    const { controller } = makeController({ queue });

    await controller.ingest({});

    // Allow the fire-and-forget promise to settle
    await Promise.resolve();
    expect(queue.enqueue).toHaveBeenCalledWith("abcd1234efgh5678");
  });

  it("does not fail the HTTP response when the queue rejects", async () => {
    const queue: jest.Mocked<Pick<DecisionsQueue, "enqueue">> = {
      enqueue: jest.fn().mockRejectedValue(new Error("redis down")),
    };
    const { controller } = makeController({ queue });

    // Must resolve — queue failure must not propagate to the HTTP layer
    await expect(controller.ingest({})).resolves.toEqual({
      accepted: true,
      decision_id: "abcd1234efgh5678",
    });
  });

  it("succeeds without a queue (optional dependency)", async () => {
    const { controller } = makeController();
    // No queue injected — must not throw
    await expect(controller.ingest({})).resolves.toEqual({
      accepted: true,
      decision_id: "abcd1234efgh5678",
    });
  });
});
