import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import type { Sql } from "postgres";

import { DatabaseHealthIndicator } from "./database.health";
import { DB_POOL, createPool } from "./database.provider";
import { MigrationRunner } from "./migration.runner";

@Global()
@Module({
  providers: [
    { provide: DB_POOL, useFactory: createPool },
    MigrationRunner,
    DatabaseHealthIndicator,
  ],
  exports: [DB_POOL, DatabaseHealthIndicator],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DB_POOL) private readonly sql: Sql) {}

  async onModuleDestroy(): Promise<void> {
    await this.sql.end();
  }
}
