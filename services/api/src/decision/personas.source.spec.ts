import { NotFoundException } from "@nestjs/common";
import type { SignalSnapshot } from "@weyos/shared-schema";

import type { SignalSnapshotRepository } from "../store/signal-snapshot.repository";
import { PersonaSource } from "./personas.source";

function makeSnapshot(): SignalSnapshot {
  return {
    schema_version: 1,
    subject_ref: "sub_live_001",
    as_of: "2026-09-11",
    constitution: { dosha: "vata" },
  };
}

function makeRepo(result: SignalSnapshot | null): Pick<SignalSnapshotRepository, "latestForSubject"> {
  return {
    latestForSubject: jest.fn().mockResolvedValue(result),
  };
}

describe("PersonaSource.resolve()", () => {
  const ORIGINAL_ENV = process.env["WEYOS_DEMO_FIXTURES"];

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env["WEYOS_DEMO_FIXTURES"];
    } else {
      process.env["WEYOS_DEMO_FIXTURES"] = ORIGINAL_ENV;
    }
  });

  describe("live path — demo disabled, repo present, subjectRef given", () => {
    beforeEach(() => {
      process.env["WEYOS_DEMO_FIXTURES"] = "false";
    });

    it("reads the snapshot from the repository", async () => {
      const snapshot = makeSnapshot();
      const repo = makeRepo(snapshot);
      const source = new PersonaSource(repo as unknown as SignalSnapshotRepository);

      const result = await source.resolve({ subjectRef: "sub_live_001" });

      expect(result.snapshot).toBe(snapshot);
      expect(repo.latestForSubject).toHaveBeenCalledWith("sub_live_001");
    });

    it("throws NotFoundException when the repository has no snapshot for the subject", async () => {
      const source = new PersonaSource(
        makeRepo(null) as unknown as SignalSnapshotRepository,
      );

      await expect(source.resolve({ subjectRef: "sub_unknown" })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("fixture path — demo enabled (default)", () => {
    beforeEach(() => {
      // Default: WEYOS_DEMO_FIXTURES is either unset ("true" by default) or explicitly "true"
      delete process.env["WEYOS_DEMO_FIXTURES"];
    });

    it("uses fixture data even when a repo is present and a subjectRef is given", async () => {
      const snapshot = makeSnapshot();
      const repo = makeRepo(snapshot);
      const source = new PersonaSource(repo as unknown as SignalSnapshotRepository);

      // sub_persona01 maps to "sarah" in the demo fixture mapping
      const result = await source.resolve({ subjectRef: "sub_persona01" });

      expect(repo.latestForSubject).not.toHaveBeenCalled();
      expect(result.persona).toBe("sarah");
    });

    it("works when no repo is injected (unit-test environments without a DB)", async () => {
      const source = new PersonaSource(); // no repo

      const result = await source.resolve({ persona: "alex", state: "calm" });
      expect(result.persona).toBe("alex");
      expect(result.snapshot).toBeDefined();
    });
  });

  describe("fixture path — demo disabled but no repo", () => {
    beforeEach(() => {
      process.env["WEYOS_DEMO_FIXTURES"] = "false";
    });

    it("falls back to fixture when the repo is absent (graceful degradation)", async () => {
      const source = new PersonaSource(); // no repo

      // With no repo the live-path condition is false; falls through to fixture path.
      // sub_persona02 maps to "james" in the demo fixture mapping.
      const result = await source.resolve({ subjectRef: "sub_persona02" });
      expect(result.persona).toBe("james");
    });
  });
});
