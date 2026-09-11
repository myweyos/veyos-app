import { Module } from "@nestjs/common";

import { BaselineModule } from "./baseline/baseline.module";
import { DecisionController } from "./decision/decision.controller";
import { DecisionService } from "./decision/decision.service";
import { PersonaSource } from "./decision/personas.source";
import { DatabaseModule } from "./database/database.module";
import { EngineClient } from "./engine/engine.client";
import { SchemaRegistry } from "./engine/schema.registry";
import { HealthController } from "./health/health.controller";
import { IngestionController } from "./ingestion/ingestion.controller";
import { SnapshotValidator } from "./ingestion/snapshot.validator";
import { NormalisationModule } from "./normalisation/normalisation.module";
import { StoreModule } from "./store/store.module";

@Module({
  imports: [DatabaseModule, StoreModule, NormalisationModule, BaselineModule],
  controllers: [HealthController, IngestionController, DecisionController],
  providers: [
    SchemaRegistry,
    SnapshotValidator,
    EngineClient,
    PersonaSource,
    DecisionService,
  ],
})
export class AppModule {}
