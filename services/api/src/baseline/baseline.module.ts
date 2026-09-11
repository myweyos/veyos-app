import { Module } from "@nestjs/common";

import { StoreModule } from "../store/store.module";
import { BaselineComputationService } from "./baseline-computation.service";

@Module({
  imports: [StoreModule],
  providers: [BaselineComputationService],
  exports: [BaselineComputationService],
})
export class BaselineModule {}
