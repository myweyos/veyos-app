import { Module } from "@nestjs/common";

import { DecisionRepository } from "./decision.repository";
import { SignalSnapshotRepository } from "./signal-snapshot.repository";

@Module({
  providers: [SignalSnapshotRepository, DecisionRepository],
  exports: [SignalSnapshotRepository, DecisionRepository],
})
export class StoreModule {}
