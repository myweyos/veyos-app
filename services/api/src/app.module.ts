import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { BaselineModule } from "./baseline/baseline.module";
import { DecisionController } from "./decision/decision.controller";
import { DecisionService } from "./decision/decision.service";
import { RulebookController } from "./decision/rulebook.controller";
import { DatabaseModule } from "./database/database.module";
import { DecisionsQueue } from "./decisions-queue/decisions.queue";
import { EngineClient } from "./engine/engine.client";
import { SchemaRegistry } from "./engine/schema.registry";
import { HealthController } from "./health/health.controller";
import { IngestionController } from "./ingestion/ingestion.controller";
import { SnapshotValidator } from "./ingestion/snapshot.validator";
import { NormalisationModule } from "./normalisation/normalisation.module";
import { RedisModule } from "./redis/redis.module";
import { StoreModule } from "./store/store.module";
import { BaselineController } from "./subjects/baseline.controller";
import { MeController } from "./subjects/me.controller";
import { T2Controller } from "./subjects/t2.controller";

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    StoreModule,
    AuthModule,
    NormalisationModule,
    BaselineModule,
  ],
  controllers: [
    HealthController,
    IngestionController,
    DecisionController,
    RulebookController,
    MeController,
    BaselineController,
    T2Controller,
  ],
  providers: [SchemaRegistry, SnapshotValidator, EngineClient, DecisionService, DecisionsQueue],
})
export class AppModule {}
