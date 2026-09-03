import { Module } from "@nestjs/common";

import { DecisionController } from "./decision/decision.controller";
import { DecisionService } from "./decision/decision.service";
import { PersonaSource } from "./decision/personas.source";
import { EngineClient } from "./engine/engine.client";
import { SchemaRegistry } from "./engine/schema.registry";
import { HealthController } from "./health/health.controller";
import { IngestionController } from "./ingestion/ingestion.controller";
import { SnapshotValidator } from "./ingestion/snapshot.validator";

@Module({
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
