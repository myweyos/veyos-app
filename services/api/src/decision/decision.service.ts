import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import type { DecisionEnvelope } from "@weyos/shared-schema";
import type Redis from "ioredis";

import { EngineClient } from "../engine/engine.client";
import { REDIS_CLIENT } from "../redis/redis.tokens";
import { DecisionRepository } from "../store/decision.repository";
import { PersonaSource, type Selector } from "./personas.source";

const DECISION_TTL_S = 86_400; // 24 h

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

  constructor(
    private readonly engine: EngineClient,
    private readonly personas: PersonaSource,
    @Optional() private readonly decisionRepo?: DecisionRepository,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
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
    await this.cacheDecision(envelope);
    return envelope;
  }

  /**
   * Look up a decision by id.
   *
   * Checks Redis first (avoids a DB round-trip for recently computed decisions and survives
   * process restarts and horizontal scaling). Falls through to the decisions table on a cache
   * miss. Throws NotFoundException for ids that exist in neither.
   */
  async byDecisionId(id: string): Promise<DecisionEnvelope> {
    if (this.redis !== undefined) {
      const raw = await this.redis.get(this.decisionKey(id));
      if (raw !== null) {
        this.log.debug(`decision cache hit: ${id}`);
        return JSON.parse(raw) as DecisionEnvelope;
      }
      this.log.debug(`decision cache miss: ${id}`);
    }

    if (this.decisionRepo !== undefined) {
      const found = await this.decisionRepo.findById(id);
      if (found !== null) {
        await this.cacheDecision(found);
        return found;
      }
    }

    throw new NotFoundException({ error: "unknown_decision" });
  }

  /** Cache a freshly computed or retrieved envelope — fire-and-forget, never throws. */
  async cacheDecision(envelope: DecisionEnvelope): Promise<void> {
    if (this.redis === undefined) return;
    try {
      await this.redis.set(
        this.decisionKey(envelope.decision_id),
        JSON.stringify(envelope),
        "EX",
        DECISION_TTL_S,
      );
    } catch (err) {
      // Cache write failures are not fatal — the source of truth is Postgres.
      this.log.warn(`decision cache write failed for ${envelope.decision_id}: ${String(err)}`);
    }
  }

  /** The snapshot a decision was computed from. `/v1/signals` needs it; a Decision has no readings. */
  async snapshotFor(selector: Selector) {
    return (await this.personas.resolve(selector)).snapshot;
  }

  private decisionKey(id: string): string {
    return `decision:${id}`;
  }
}
