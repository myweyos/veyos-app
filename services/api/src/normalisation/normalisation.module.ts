import { Module } from "@nestjs/common";

import { StoreModule } from "../store/store.module";
import { NormalisationService } from "./normalisation.service";

@Module({
  imports: [StoreModule],
  providers: [NormalisationService],
  exports: [NormalisationService],
})
export class NormalisationModule {}
