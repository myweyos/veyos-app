import { Injectable, Logger, NotFoundException, OnModuleInit, Optional } from "@nestjs/common";
import type { DecisionEnvelope } from "@weyos/shared-schema";

import { EngineClient } from "../engine/engine.client";
import { DecisionRepository } from "../store/decision.repository";
import { PersonaSource, type Selector } from "./personas.source";

/**
 * One decision per request, projected five ways.
 *
 * Every endpoint below `/v1/decision`, `/v1/signals`, `/v1/plan` and `/v1/meal` is a view of
 * the SAME envelope. Computing it once here is what guarantees `/plan` and `/meal` can never
 * disagree about what tonight looks like — a class of bug that would be invisible in testing
 * and obvious to a user.
 */
@Injectable()
export class DecisionService implements OnModuleInit {
  private readonly log = new Logger(DecisionService.name);

  /**
   * Resolves `/decision/:id/trace` with no persistence.
   *
   * The engine is deterministic, so the whole demo matrix — 3 personas × 2 states × 2
   * elemental settings — is 12 decisions that can be computed at boot in one batched call and
   * held in memory. When the decisions table lands this becomes a repository lookup and
   * nothing else changes. Empty when demo fixtures are off.
   */
  private readonly byId = new Map<string, DecisionEnvelope>();

  constructor(
    private readonly engine: EngineClient,
    private readonly personas: PersonaSource,
    @Optional() private readonly decisionRepo?: DecisionRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.personas.demoEnabled) return;
    const health = await this.engine.health();
    if (!health.reachable) {
      // Not fatal. The API should start and report an unhealthy engine rather than
      // crash-looping; `/health/ready` is where that surfaces.
      this.log.warn("engine unreachable at boot; decision cache is empty");
      return;
    }
    let warmed = 0;
    for (const selector of this.personas.matrix()) {
      try {
        await this.forSelector(selector);
        warmed++;
      } catch {
        // Ids only in logs, never payloads.
        this.log.warn(`could not warm ${selector.persona}/${selector.state}`);
      }
    }
    this.log.log(`decision cache warmed: ${warmed} entries, rulebook v${health.rulebookVersion}`);
  }

  async forSelector(selector: Selector): Promise<DecisionEnvelope> {
    const { snapshot } = await this.personas.resolve(selector);
    const envelope = await this.engine.decide(snapshot, selector.elemental);
    this.byId.set(envelope.decision_id, envelope);
    return envelope;
  }

  /**
   * Look up a decision by id.
   *
   * Checks the in-memory demo cache first (avoids a DB round-trip for fixture decisions).
   * Falls through to the decisions table when the cache misses. Throws NotFoundException
   * for ids that exist in neither — consistent with the previous synchronous behaviour.
   */
  async byDecisionId(id: string): Promise<DecisionEnvelope> {
    const cached = this.byId.get(id);
    if (cached !== undefined) return cached;
    if (this.decisionRepo !== undefined) {
      const found = await this.decisionRepo.findById(id);
      if (found !== null) return found;
    }
    throw new NotFoundException({ error: "unknown_decision" });
  }

  /** The snapshot a decision was computed from. `/v1/signals` needs it; a Decision has no readings. */
  async snapshotFor(selector: Selector) {
    return (await this.personas.resolve(selector)).snapshot;
  }
}
