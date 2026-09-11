import type { Sql } from "postgres";

import { DatabaseHealthIndicator } from "./database.health";

function makeSql(shouldThrow: boolean): Sql {
  const fn = jest.fn();
  if (shouldThrow) {
    fn.mockRejectedValue(new Error("connection refused"));
  } else {
    fn.mockResolvedValue([]);
  }
  return fn as unknown as Sql;
}

describe("DatabaseHealthIndicator", () => {
  it("returns reachable:true when SELECT 1 succeeds", async () => {
    const indicator = new DatabaseHealthIndicator(makeSql(false));
    expect(await indicator.ping()).toEqual({ reachable: true });
  });

  it("returns reachable:false when the pool throws — does not propagate", async () => {
    // A dead pool must not crash the health endpoint; it must surface as {reachable:false}
    // so the readiness probe can return 503 gracefully instead of a 500.
    const indicator = new DatabaseHealthIndicator(makeSql(true));
    const result = await indicator.ping();
    expect(result).toEqual({ reachable: false });
  });
});
