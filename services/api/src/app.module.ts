import { Module } from "@nestjs/common";

import { HealthController } from "./health/health.controller";
import { IngestionController } from "./ingestion/ingestion.controller";
import { SnapshotValidator } from "./ingestion/snapshot.validator";

@Module({
  controllers: [HealthController, IngestionController],
  providers: [SnapshotValidator],
})
export class AppModule {}
