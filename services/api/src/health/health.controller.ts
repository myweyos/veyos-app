import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  /** Liveness only. Readiness (db + engine reachable) is VEY-INFRA-3. */
  @Get()
  live(): { status: "ok"; service: string } {
    return { status: "ok", service: "weyos-api" };
  }
}
