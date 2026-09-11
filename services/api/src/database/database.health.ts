import { Inject, Injectable } from "@nestjs/common";
import type { Sql } from "postgres";

import { DB_POOL } from "./database.provider";

@Injectable()
export class DatabaseHealthIndicator {
  constructor(@Inject(DB_POOL) private readonly sql: Sql) {}

  /** SELECT 1 — fast, zero biometrics, correct circuit-breaker for a pool that cannot connect. */
  async ping(): Promise<{ reachable: boolean }> {
    try {
      await this.sql`SELECT 1`;
      return { reachable: true };
    } catch {
      return { reachable: false };
    }
  }
}
