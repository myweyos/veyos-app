import Redis from "ioredis";

export { REDIS_CLIENT } from "./redis.tokens";

/**
 * Creates the shared ioredis client.
 *
 * Reads REDIS_URL from the environment — already set in .env for local dev and matched
 * by docker-compose. Fails fast at boot if the variable is absent.
 *
 * TODO(SCRUM-77): per-region Redis routing replaces the single REDIS_URL here, the same
 * seam as database.provider.ts. UK and US data must land in region-pinned Redis instances.
 */
export function createRedisClient(): Redis {
  const url = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}
