import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import type Redis from "ioredis";

import { RedisHealthIndicator } from "./redis.health";
import { REDIS_CLIENT, createRedisClient } from "./redis.provider";

@Global()
@Module({
  providers: [
    { provide: REDIS_CLIENT, useFactory: createRedisClient },
    RedisHealthIndicator,
  ],
  exports: [REDIS_CLIENT, RedisHealthIndicator],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
