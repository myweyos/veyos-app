import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { DatabaseHealthIndicator } from "../database/database.health";
import { EngineClient } from "../engine/engine.client";

@Controller("health")
export class HealthController {
  constructor(
    private readonly engine: EngineClient,
    private readonly db: DatabaseHealthIndicator,
  ) {}

  /** Liveness only. Says nothing about whether the service can actually do its job. */
  @Get()
  live(): { status: "ok"; service: string } {
    return { status: "ok", service: "weyos-api" };
  }

  /**
   * Readiness — VEY-INFRA-3.
   *
   * Checks the engine sidecar and the database pool. Both must be reachable; the service
   * cannot store or serve decisions if either is down. Probes run in parallel to keep
   * readiness latency low.
   *
   * 503 rather than a 200 with a degraded flag: a service that cannot persist health data
   * must not accept it — Art.9 data lost to a half-open DB is worse than a failed request.
   */
  @Get("ready")
  async ready(): Promise<{
    status: "ok";
    engine: { reachable: true; rulebook_version?: number };
    db: { reachable: true };
  }> {
    const [engine, db] = await Promise.all([
      this.engine.health(),
      this.db.ping(),
    ]);

    if (!engine.reachable || !db.reachable) {
      throw new ServiceUnavailableException({
        status: "unavailable",
        engine: { reachable: engine.reachable },
        db: { reachable: db.reachable },
      });
    }

    const enginePayload: { reachable: true; rulebook_version?: number } = {
      reachable: true,
    };
    if (engine.rulebookVersion !== undefined)
      enginePayload.rulebook_version = engine.rulebookVersion;

    return { status: "ok", engine: enginePayload, db: { reachable: true } };
  }
}
