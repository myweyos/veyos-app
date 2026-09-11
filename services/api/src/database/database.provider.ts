import postgres, { type Sql } from "postgres";

export const DB_POOL: unique symbol = Symbol("DB_POOL");

/**
 * Creates the single shared connection pool.
 *
 * Reads DATABASE_URL from the environment — already populated in .env for local dev and
 * matched by docker-compose. Fails fast at boot if the variable is absent so the error
 * surfaces immediately rather than on the first request.
 *
 * TODO(SCRUM-77): per-region pool routing replaces the single DATABASE_URL here.
 * A UK subject's snapshots must never land in a US-hosted database instance.
 * When SCRUM-77 lands, this factory becomes a map of region → Sql keyed by account region
 * resolved at request time via auth context.
 */
export function createPool(): Sql {
  const url = process.env["DATABASE_URL"];
  if (!url)
    throw new Error(
      "DATABASE_URL is not set — check .env or environment config",
    );
  return postgres(url, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 5,
  });
}
