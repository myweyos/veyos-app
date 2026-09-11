import type { DecisionEnvelope } from "@weyos/shared-schema";
import type { Sql } from "postgres";

import { DecisionRepository } from "./decision.repository";

/** Minimal envelope satisfying the fields DecisionRepository accesses. */
function makeEnvelope(id = "abcd1234efgh5678"): DecisionEnvelope {
  return {
    decision_id: id,
    decision: {
      schema_version: 1,
      subject_ref: "sub_test_001",
      as_of: "2026-09-11",
      rulebook_version: 1,
      state: "calm",
      fired_rules: [],
      activity: { verdict: "allow" },
      food: { meals: [], mandated_tags: [], blocked_tags: [] },
      supplements: [],
      trace: [],
    },
    presentation: {
      unevaluable_rule_ids: [],
      suppressed_rule_ids: [],
      warning_kinds: [],
    },
  } as unknown as DecisionEnvelope;
}

function makeSql(rows: unknown[] = []): Sql {
  return jest.fn().mockResolvedValue(rows) as unknown as Sql;
}

describe("DecisionRepository", () => {
  describe("findById", () => {
    it("returns the envelope when the row exists", async () => {
      const envelope = makeEnvelope();
      const repo = new DecisionRepository(makeSql([{ envelope }]));
      expect(await repo.findById(envelope.decision_id)).toBe(envelope);
    });

    it("returns null when no row matches — caller decides the 404 policy", async () => {
      const repo = new DecisionRepository(makeSql([]));
      expect(await repo.findById("unknown_id")).toBeNull();
    });
  });

  describe("save", () => {
    it("inserts with decision_id, subject_ref, as_of, and the full envelope as JSON", async () => {
      // First call (SELECT check) returns empty — not seen before; second call is INSERT.
      const sql = jest.fn()
        .mockResolvedValueOnce([])  // SELECT check: not found
        .mockResolvedValueOnce([]) as unknown as Sql; // INSERT
      const repo = new DecisionRepository(sql);
      const envelope = makeEnvelope("deadbeef12345678");

      await repo.save(envelope);

      const insertCall = (sql as unknown as jest.Mock).mock.calls[1] as [string[], string, string, string, unknown];
      const [templateParts, decisionId, subjectRef, asOf] = insertCall;

      expect(templateParts[0]).toMatch(/INSERT INTO decisions/);
      expect(decisionId).toBe("deadbeef12345678");
      expect(subjectRef).toBe("sub_test_001");
      expect(asOf).toBe("2026-09-11");

      // envelope is passed as the object directly — not pre-stringified.
      // postgres.js serialises objects to JSONB correctly; JSON.stringify causes double-serialisation.
      const envelopeArg = (sql as unknown as jest.Mock).mock.calls[1][4] as unknown;
      expect(envelopeArg).toMatchObject({ decision_id: "deadbeef12345678" });
    });

    it("skips the insert when the decision_id already exists (idempotency)", async () => {
      const sql = jest.fn()
        .mockResolvedValueOnce([{ decision_id: "abcd1234efgh5678" }]) as unknown as Sql; // SELECT: found
      const repo = new DecisionRepository(sql);

      await repo.save(makeEnvelope());

      // Only one call (the SELECT check) — INSERT must not be called.
      expect((sql as unknown as jest.Mock).mock.calls).toHaveLength(1);
    });
  });
});
