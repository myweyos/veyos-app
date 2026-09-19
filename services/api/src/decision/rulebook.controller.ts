import { Controller, Get, Header } from "@nestjs/common";

import { EngineClient, type RulebookListing } from "../engine/engine.client";

/**
 * The rulebook as a user can read it: every rule's id, name and layer.
 *
 * Public, because it describes the product, not a subject. The app needs it for two things:
 * the H7 "The rulebook" screen, and mapping unevaluable rule ids to their layer when it derives
 * the app state (@weyos/app-state), rather than guessing a layer from an id's leading digit.
 */
@Controller("v1/rulebook")
export class RulebookController {
  constructor(private readonly engine: EngineClient) {}

  @Get()
  @Header("cache-control", "public, max-age=300")
  async rulebook(): Promise<RulebookListing> {
    return this.engine.rulebook();
  }
}
