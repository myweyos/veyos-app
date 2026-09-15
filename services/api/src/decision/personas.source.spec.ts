import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
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

  describe("default — demo is OFF unless explicitly enabled (CLAUDE.md non-negotiable 9)", () => {
    it.each([undefined, "", "1", "yes", "TRUE", "false"])(
      "WEYOS_DEMO_FIXTURES=%p does not enable fixtures",
      (value) => {
        if (value === undefined) delete process.env["WEYOS_DEMO_FIXTURES"];
        else process.env["WEYOS_DEMO_FIXTURES"] = value;
        expect(new PersonaSource().demoEnabled).toBe(false);
      },
    );

    it("never serves a persona for a persona selector when unset", async () => {
      delete process.env["WEYOS_DEMO_FIXTURES"];
      const source = new PersonaSource();
      await expect(source.resolve({ persona: "james", state: "crash" })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("fixture path — demo explicitly enabled (local dev harness only)", () => {
    beforeEach(() => {
      process.env["WEYOS_DEMO_FIXTURES"] = "true";
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

  describe("demo disabled but no repo", () => {
    beforeEach(() => {
      delete process.env["WEYOS_DEMO_FIXTURES"];
    });

    it("refuses with 503 rather than serving fixture data as a real subject", async () => {
      const source = new PersonaSource(); // no repo

      // sub_persona02 is James's fixture id. Before this change the call fell through to the
      // fixture path and returned his persona as if it were a subject's real snapshot.
      await expect(source.resolve({ subjectRef: "sub_persona02" })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
