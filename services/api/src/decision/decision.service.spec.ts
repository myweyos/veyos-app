import { NotFoundException } from "@nestjs/common";
import type { DecisionEnvelope } from "@weyos/shared-schema";

import type { EngineClient } from "../engine/engine.client";
import type { DecisionRepository } from "../store/decision.repository";
import { DecisionService } from "./decision.service";
import type { PersonaSource } from "./personas.source";

function makeEnvelope(id: string): DecisionEnvelope {
  return { decision_id: id } as unknown as DecisionEnvelope;
}

function makePersonaSource(): jest.Mocked<Pick<PersonaSource, "resolve" | "demoEnabled" | "matrix">> {
  return {
    demoEnabled: false,
    resolve: jest.fn(),
    matrix: jest.fn().mockReturnValue([]),
  };
}

function makeEngine(): jest.Mocked<Pick<EngineClient, "health" | "decide">> {
  return {
    health: jest.fn().mockResolvedValue({ reachable: false }),
    decide: jest.fn(),
  };
}

function makeRepo(): jest.Mocked<Pick<DecisionRepository, "findById" | "save">> {
  return {
    findById: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function makeRedis(value: string | null = null): jest.Mocked<{ get: jest.Mock; set: jest.Mock }> {
  return {
    get: jest.fn().mockResolvedValue(value),
    set: jest.fn().mockResolvedValue("OK"),
  };
}

describe("DecisionService.byDecisionId() — without Redis", () => {
  it("falls through to DecisionRepository when no Redis is injected", async () => {
    const envelope = makeEnvelope("db-id");
    const repo = makeRepo();
    repo.findById.mockResolvedValue(envelope);

    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
      repo as unknown as DecisionRepository,
    );

    const result = await service.byDecisionId("db-id");
    expect(repo.findById).toHaveBeenCalledWith("db-id");
    expect(result).toBe(envelope);
  });

  it("throws NotFoundException when neither Redis nor DB has the id", async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(null);

    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
      repo as unknown as DecisionRepository,
    );

    await expect(service.byDecisionId("ghost-id")).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when no repo and no Redis are injected", async () => {
    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
    );

    await expect(service.byDecisionId("any-id")).rejects.toThrow(NotFoundException);
  });
});

describe("DecisionService.byDecisionId() — with Redis", () => {
  it("returns the envelope from Redis on a cache hit (no DB call)", async () => {
    const envelope = makeEnvelope("redis-hit-id");
    const redis = makeRedis(JSON.stringify(envelope));
    const repo = makeRepo();

    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
      repo as unknown as DecisionRepository,
      redis as never,
    );

    const result = await service.byDecisionId("redis-hit-id");

    expect(redis.get).toHaveBeenCalledWith("decision:redis-hit-id");
    expect(repo.findById).not.toHaveBeenCalled();
    expect(result).toEqual(envelope);
  });

  it("falls through to DB on a Redis miss and writes result back to Redis", async () => {
    const envelope = makeEnvelope("db-miss-id");
    const redis = makeRedis(null); // cache miss
    const repo = makeRepo();
    repo.findById.mockResolvedValue(envelope);

    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
      repo as unknown as DecisionRepository,
      redis as never,
    );

    const result = await service.byDecisionId("db-miss-id");

    expect(redis.get).toHaveBeenCalledWith("decision:db-miss-id");
    expect(repo.findById).toHaveBeenCalledWith("db-miss-id");
    expect(redis.set).toHaveBeenCalledWith(
      "decision:db-miss-id",
      JSON.stringify(envelope),
      "EX",
      86_400,
    );
    expect(result).toBe(envelope);
  });

  it("throws NotFoundException when Redis misses and DB also misses", async () => {
    const redis = makeRedis(null);
    const repo = makeRepo();
    repo.findById.mockResolvedValue(null);

    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
      repo as unknown as DecisionRepository,
      redis as never,
    );

    await expect(service.byDecisionId("nowhere-id")).rejects.toThrow(NotFoundException);
  });
});

describe("DecisionService.cacheDecision()", () => {
  it("writes the envelope to Redis with the correct key and 24 h TTL", async () => {
    const envelope = makeEnvelope("cache-write-id");
    const redis = makeRedis();

    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
      undefined,
      redis as never,
    );

    await service.cacheDecision(envelope);

    expect(redis.set).toHaveBeenCalledWith(
      "decision:cache-write-id",
      JSON.stringify(envelope),
      "EX",
      86_400,
    );
  });

  it("does nothing when Redis is not injected", async () => {
    const envelope = makeEnvelope("no-redis-id");
    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
    );
    // Must not throw
    await expect(service.cacheDecision(envelope)).resolves.toBeUndefined();
  });
});
