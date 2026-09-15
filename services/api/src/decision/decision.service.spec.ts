import { NotFoundException } from "@nestjs/common";
import type { DecisionEnvelope } from "@weyos/shared-schema";

import type { DecisionRepository } from "../store/decision.repository";
import type { SignalSnapshotRepository } from "../store/signal-snapshot.repository";
import { DecisionService } from "./decision.service";

const ME = "sub_authed00001";

function makeEnvelope(id: string, subjectRef = ME): DecisionEnvelope {
  return {
    decision_id: id,
    decision: { subject_ref: subjectRef, as_of: "2026-09-14" },
  } as unknown as DecisionEnvelope;
}

function makeRepo(
  overrides: Partial<Record<"findById" | "latestForSubject", jest.Mock>> = {},
): jest.Mocked<Pick<DecisionRepository, "findById" | "latestForSubject">> {
  return {
    findById: overrides.findById ?? jest.fn().mockResolvedValue(null),
    latestForSubject: overrides.latestForSubject ?? jest.fn().mockResolvedValue(null),
  };
}

function makeSnapshots(): jest.Mocked<Pick<SignalSnapshotRepository, "latestForSubject">> {
  return { latestForSubject: jest.fn().mockResolvedValue(null) };
}

function makeRedis(value: string | null = null): { get: jest.Mock; set: jest.Mock } {
  return { get: jest.fn().mockResolvedValue(value), set: jest.fn().mockResolvedValue("OK") };
}

function service(
  repo = makeRepo(),
  redis?: { get: jest.Mock; set: jest.Mock },
  snapshots = makeSnapshots(),
): DecisionService {
  return new DecisionService(
    repo as unknown as DecisionRepository,
    snapshots as unknown as SignalSnapshotRepository,
    redis as never,
  );
}

describe("DecisionService.today()", () => {
  it("serves the subject's latest STORED decision and never calls the engine", async () => {
    const envelope = makeEnvelope("stored0000000001");
    const repo = makeRepo({ latestForSubject: jest.fn().mockResolvedValue(envelope) });
    expect(await service(repo).today(ME)).toBe(envelope);
    expect(repo.latestForSubject).toHaveBeenCalledWith(ME);
  });

  it("404s with no_decision_yet for a subject who has never ingested", async () => {
    await expect(service().today(ME)).rejects.toThrow(NotFoundException);
  });
});

describe("DecisionService.byDecisionId()", () => {
  it("returns the subject's own decision from the store and caches it", async () => {
    const envelope = makeEnvelope("mine000000000001");
    const redis = makeRedis();
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(envelope) });
    expect(await service(repo, redis).byDecisionId("mine000000000001", ME)).toBe(envelope);
    expect(redis.set).toHaveBeenCalled();
  });

  it("serves a cache hit without touching Postgres", async () => {
    const envelope = makeEnvelope("cached0000000001");
    const repo = makeRepo();
    const result = await service(repo, makeRedis(JSON.stringify(envelope))).byDecisionId(
      "cached0000000001",
      ME,
    );
    expect(result.decision_id).toBe("cached0000000001");
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it("404s on someone else's decision id: never reveals that it exists", async () => {
    const theirs = makeEnvelope("theirs0000000001", "sub_someoneelse01");
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(theirs) });
    await expect(service(repo).byDecisionId("theirs0000000001", ME)).rejects.toThrow(
      NotFoundException,
    );
    const cached = makeRedis(JSON.stringify(theirs));
    await expect(service(makeRepo(), cached).byDecisionId("theirs0000000001", ME)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("treats a broken cache as a miss, not an outage", async () => {
    const envelope = makeEnvelope("mine000000000002");
    const redis = { get: jest.fn().mockRejectedValue(new Error("down")), set: jest.fn() };
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(envelope) });
    expect(await service(repo, redis).byDecisionId("mine000000000002", ME)).toBe(envelope);
  });
});
