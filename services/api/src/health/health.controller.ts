import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { EngineClient } from "../engine/engine.client";

@Controller("health")
export class HealthController {
  constructor(private readonly engine: EngineClient) {}

  /** Liveness only. Says nothing about whether the service can actually do its job. */
  @Get()
  live(): { status: "ok"; service: string } {
    return { status: "ok", service: "weyos-api" };
  }

  /**
   * Readiness — VEY-INFRA-3, partially.
   *
   * Checks the engine sidecar, which is the only downstream dependency that exists today.
   * Extend this to the database when persistence lands (VEY-INGEST-2); until then a green
   * readiness probe means "can serve decisions", not "can store them".
   *
   * 503 rather than a 200 with a degraded flag: an API that cannot reach the engine cannot
   * produce guidance, and there is no default advice to fall back to.
   */
  @Get("ready")
  async ready(): Promise<{ status: "ok"; engine: { reachable: true; rulebook_version?: number } }> {
    const engine = await this.engine.health();
    if (!engine.reachable) {
      throw new ServiceUnavailableException({ status: "unavailable", engine: { reachable: false } });
    }
    const payload: { reachable: true; rulebook_version?: number } = { reachable: true };
    if (engine.rulebookVersion !== undefined) payload.rulebook_version = engine.rulebookVersion;
    return { status: "ok", engine: payload };
  }
}
