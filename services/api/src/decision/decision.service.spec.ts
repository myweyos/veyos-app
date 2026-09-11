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

describe("DecisionService.byDecisionId()", () => {
  it("returns the envelope directly from the in-memory cache (no DB call)", async () => {
    const envelope = makeEnvelope("cached-id");
    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
    );
    // Seed the private cache by writing to it through the public map interface
    (service as unknown as { byId: Map<string, DecisionEnvelope> }).byId.set(
      "cached-id",
      envelope,
    );

    const result = await service.byDecisionId("cached-id");

    expect(result).toBe(envelope);
  });

  it("falls through to the DecisionRepository on a cache miss", async () => {
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

  it("throws NotFoundException when neither cache nor DB has the id", async () => {
    const repo = makeRepo();
    repo.findById.mockResolvedValue(null);

    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
      repo as unknown as DecisionRepository,
    );

    await expect(service.byDecisionId("ghost-id")).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when no repo is injected and cache misses", async () => {
    // Without a DB (e.g. unit-test environment), a cache miss must still 404 cleanly.
    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
      // no repo
    );

    await expect(service.byDecisionId("any-id")).rejects.toThrow(NotFoundException);
  });

  it("does not call the repo when the id is found in cache", async () => {
    const envelope = makeEnvelope("cached-only");
    const repo = makeRepo();

    const service = new DecisionService(
      makeEngine() as unknown as EngineClient,
      makePersonaSource() as unknown as PersonaSource,
      repo as unknown as DecisionRepository,
    );
    (service as unknown as { byId: Map<string, DecisionEnvelope> }).byId.set(
      "cached-only",
      envelope,
    );

    await service.byDecisionId("cached-only");

    expect(repo.findById).not.toHaveBeenCalled();
  });
});
