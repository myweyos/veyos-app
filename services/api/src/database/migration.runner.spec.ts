import type { Sql } from "postgres";

// Mock node:fs before the module-under-test is imported so that its top-level
// readFileSync/readdirSync calls hit the mock rather than the filesystem.
jest.mock("node:fs");

import { readFileSync, readdirSync } from "node:fs";

import { MigrationRunner } from "./migration.runner";

const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;

/** Returns a mock Sql whose tagged-template calls resolve to `rows` by default. */
function makeSql(rows: unknown[] = []) {
  const txSql = Object.assign(jest.fn().mockResolvedValue([]), {
    unsafe: jest.fn().mockResolvedValue([]),
  });

  const sql = Object.assign(
    // First call → CREATE TABLE; subsequent calls → whatever rows are set per-test
    jest.fn().mockResolvedValue(rows),
    {
      begin: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(txSql),
        ),
      end: jest.fn().mockResolvedValue(undefined),
    },
  );

  return { sql: sql as unknown as Sql, txSql };
}

describe("MigrationRunner", () => {
  afterEach(() => jest.clearAllMocks());

  it("skips migrations already recorded in _migrations", async () => {
    const { sql } = makeSql();
    // First tagged-template call: CREATE TABLE (returns [])
    // Second tagged-template call: SELECT filename (returns the already-applied file)
    (sql as unknown as jest.Mock)
      .mockResolvedValueOnce([]) // CREATE TABLE
      .mockResolvedValueOnce([{ filename: "0001_enable_timescaledb.sql" }]); // SELECT

    mockReaddirSync.mockReturnValue([
      "0001_enable_timescaledb.sql",
    ] as unknown as ReturnType<typeof readdirSync>);

    const runner = new MigrationRunner(sql);
    await runner.onApplicationBootstrap();

    expect(
      (sql as unknown as { begin: jest.Mock }).begin,
    ).not.toHaveBeenCalled();
  });

  it("applies pending migrations in filename order", async () => {
    const { sql, txSql } = makeSql();
    (sql as unknown as jest.Mock)
      .mockResolvedValueOnce([]) // CREATE TABLE
      .mockResolvedValueOnce([]); // SELECT — nothing applied yet

    // Provide files out of alphabetical order to verify sort
    mockReaddirSync.mockReturnValue([
      "0002_signal_snapshots.sql",
      "0001_enable_timescaledb.sql",
    ] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(
      "-- stub sql",
    );

    const runner = new MigrationRunner(sql);
    await runner.onApplicationBootstrap();

    const beginMock = (sql as unknown as { begin: jest.Mock }).begin;
    expect(beginMock).toHaveBeenCalledTimes(2);

    // unsafe() receives the SQL text; order of invocations reflects filename sort
    const unsafeCalls = txSql.unsafe.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(unsafeCalls).toEqual(["-- stub sql", "-- stub sql"]); // both files have same stub
  });

  it("records each applied migration in _migrations inside the same transaction", async () => {
    const { sql, txSql } = makeSql();
    (sql as unknown as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockReaddirSync.mockReturnValue([
      "0001_enable_timescaledb.sql",
    ] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(
      "CREATE EXTENSION timescaledb;",
    );

    const runner = new MigrationRunner(sql);
    await runner.onApplicationBootstrap();

    // txSql is the transaction object; the second call to it is the INSERT into _migrations
    expect(txSql).toHaveBeenCalledTimes(1);
    // The template string contains the INSERT statement (first element of the call args array)
    const [templateParts] = txSql.mock.calls[0] as [string[]];
    expect(templateParts[0]).toMatch(/INSERT INTO _migrations/);
  });

  it("propagates a migration error and halts remaining migrations (fail-closed)", async () => {
    const { sql } = makeSql();
    (sql as unknown as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const beginMock = (sql as unknown as { begin: jest.Mock }).begin;
    beginMock.mockRejectedValueOnce(new Error("syntax error in migration"));

    mockReaddirSync.mockReturnValue([
      "0001.sql",
      "0002.sql",
    ] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(
      "-- sql",
    );

    const runner = new MigrationRunner(sql);
    await expect(runner.onApplicationBootstrap()).rejects.toThrow(
      "syntax error in migration",
    );

    // Only one begin() call: the runner halted before attempting the second file
    expect(beginMock).toHaveBeenCalledTimes(1);
  });
});
