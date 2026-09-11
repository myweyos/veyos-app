import type { SignalSnapshot } from "@weyos/shared-schema";
import type { Sql } from "postgres";

import { SignalSnapshotRepository } from "./signal-snapshot.repository";

/** Minimum valid snapshot (all optional fields absent). */
function makeSnapshot(subjectRef = "sub_test_001", asOf = "2026-09-11"): SignalSnapshot {
  return {
    schema_version: 1,
    subject_ref: subjectRef,
    as_of: asOf,
    constitution: { dosha: "vata" },
  };
}

function makeSql(rows: unknown[] = []): Sql {
  return jest.fn().mockResolvedValue(rows) as unknown as Sql;
}

describe("SignalSnapshotRepository", () => {
  describe("latestForSubject", () => {
    it("returns the snapshot_json object when a row is found", async () => {
      const snapshot = makeSnapshot();
      const repo = new SignalSnapshotRepository(makeSql([{ snapshot_json: snapshot }]));
      expect(await repo.latestForSubject("sub_test_001")).toBe(snapshot);
    });

    it("returns null when no row exists for the subject+date", async () => {
      const repo = new SignalSnapshotRepository(makeSql([]));
      expect(await repo.latestForSubject("sub_unknown")).toBeNull();
    });

    it("uses today's ISO date when asOf is omitted", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const sql = makeSql([]);
      const repo = new SignalSnapshotRepository(sql);

      await repo.latestForSubject("sub_test_001");

      // The tagged template receives (strings, subjectRef, date).
      // Index 0 → template strings array, 1 → subjectRef, 2 → date.
      const callArgs = (sql as unknown as jest.Mock).mock.calls[0] as unknown[];
      expect(callArgs[2]).toBe(today);
    });

    it("passes the explicit asOf date through unchanged", async () => {
      const sql = makeSql([]);
      const repo = new SignalSnapshotRepository(sql);

      await repo.latestForSubject("sub_test_001", "2026-01-15");

      const callArgs = (sql as unknown as jest.Mock).mock.calls[0] as unknown[];
      expect(callArgs[2]).toBe("2026-01-15");
    });
  });

  describe("upsert", () => {
    it("executes without throwing for a minimal snapshot (no optional fields)", async () => {
      const repo = new SignalSnapshotRepository(makeSql([]));
      await expect(repo.upsert(makeSnapshot())).resolves.toBeUndefined();
    });

    it("passes snapshot_json as the original snapshot object (not pre-stringified)", async () => {
      const sql = makeSql([]);
      const snapshot = makeSnapshot("sub_test_001", "2026-09-11");
      const repo = new SignalSnapshotRepository(sql);

      await repo.upsert(snapshot);

      const callArgs = (sql as unknown as jest.Mock).mock.calls[0] as unknown[];
      // snapshot_json is passed as the object itself; postgres.js serialises it to JSONB.
      // JSON.stringify-then-::jsonb causes double-serialisation (stores as JSONB string, not object).
      const snapshotJsonParam = callArgs.find(
        (a) => typeof a === "object" && a !== null && (a as Record<string, unknown>)["subject_ref"] !== undefined,
      );
      expect(snapshotJsonParam).toMatchObject({ subject_ref: "sub_test_001", as_of: "2026-09-11" });
    });
  });
});
