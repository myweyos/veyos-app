import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import type { Sql } from "postgres";

import { DB_POOL } from "./database.provider";

/**
 * Applies pending SQL migration files at boot, in filename order, each in its own transaction.
 *
 * Migration files live in ./migrations/ as *.sql. Nest's asset copy (nest-cli.json) puts them
 * alongside the compiled JS at dist/database/migrations/, which is __dirname/migrations/ at
 * runtime. Applied filenames are recorded in _migrations — skipped on subsequent boots.
 *
 * Each file runs in a transaction: if a migration throws, the transaction rolls back, the
 * error propagates, and the app refuses to start. Fail-closed is correct for a health-data
 * product: a half-applied schema is worse than a failed deployment.
 */
@Injectable()
export class MigrationRunner implements OnApplicationBootstrap {
  private readonly log = new Logger(MigrationRunner.name);
  private readonly migrationsDir = join(__dirname, "migrations");

  constructor(@Inject(DB_POOL) private readonly sql: Sql) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    const rows = await this.sql<{ filename: string }[]>`
      SELECT filename FROM _migrations ORDER BY filename
    `;
    const applied = new Set(rows.map((r) => r.filename));

    const files = readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const filename of files) {
      if (applied.has(filename)) continue;

      const sqlText = readFileSync(join(this.migrationsDir, filename), "utf-8");
      await this.sql.begin(async (tx) => {
        await tx.unsafe(sqlText);
        await tx`INSERT INTO _migrations (filename) VALUES (${filename})`;
      });
      this.log.log(`migration applied: ${filename}`);
    }
  }
}
