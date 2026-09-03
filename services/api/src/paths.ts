import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Locate the repo root by walking up from this file until the contract directory appears.
 *
 * Not a fixed number of `..` segments, deliberately. The emit layout differs between running
 * from `src` (ts-node, jest) and from `dist`, and it changed again when `rootDir` had to widen
 * to include `@weyos/shared-schema` source. Counting directories broke the service at boot,
 * silently, in a way that only showed up when the API was first actually started.
 *
 * Marker is `packages/shared-schema/schemas` rather than `package.json`, because every
 * workspace has one of those and the first hit walking up would be the wrong one.
 *
 * This whole mechanism goes away once shared-schema publishes built output and its schemas
 * are resolved through node module resolution instead of the filesystem (VEY-SCHEMA-GEN).
 */
export function repoRoot(from: string = __dirname): string {
  let current = from;
  for (let depth = 0; depth < 12; depth++) {
    if (existsSync(join(current, "packages", "shared-schema", "schemas"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(
    `could not locate the repo root walking up from ${from}. The API resolves schemas and ` +
      `fixtures off the monorepo layout; a container copying only services/api will fail here, ` +
      `at boot, which is the right time to find out.`,
  );
}

export const SCHEMA_DIR = join(repoRoot(), "packages", "shared-schema", "schemas");
export const DEMO_FIXTURES_DIR = join(repoRoot(), "packages", "demo-fixtures");
