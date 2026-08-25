import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Injectable } from "@nestjs/common";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { SignalSnapshot } from "@weyos/shared-schema";

const SCHEMA_PATH = join(
  __dirname,
  "../../../../packages/shared-schema/schemas/signal-snapshot.schema.json",
);

export type ValidationResult =
  | { ok: true; value: SignalSnapshot }
  | { ok: false; errors: string[] };

/**
 * Validates against the SAME schema file the engine's contract tests use. Do not
 * reimplement these checks in TypeScript — one schema, three consumers, no drift.
 */
@Injectable()
export class SnapshotValidator {
  private readonly validateFn: ValidateFunction;

  constructor() {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateFn = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf-8")));
  }

  validate(payload: unknown): ValidationResult {
    if (this.validateFn(payload)) {
      return { ok: true, value: payload as SignalSnapshot };
    }
    const errors = (this.validateFn.errors ?? []).map(
      // Path + message only. Never echo the value back: it is a biometric.
      (error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`,
    );
    return { ok: false, errors };
  }
}
