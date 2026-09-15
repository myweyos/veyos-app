import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";

import { REDIS_CLIENT } from "./redis.tokens";

@Injectable()
export class RedisHealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** PING — fast, zero biometrics, correct circuit-breaker for a client that cannot connect. */
  async ping(): Promise<{ reachable: boolean }> {
    try {
      const reply = await this.redis.ping();
      return { reachable: reply === "PONG" };
    } catch {
      return { reachable: false };
    }
  }
}
