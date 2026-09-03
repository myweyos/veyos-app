import { Injectable } from "@nestjs/common";
import type { SignalSnapshot } from "@weyos/shared-schema";

import { SchemaRegistry } from "../engine/schema.registry";

export type ValidationResult =
  | { ok: true; value: SignalSnapshot }
  | { ok: false; errors: string[] };

/**
 * Validates against the SAME schema file the engine's contract tests use. Do not
 * reimplement these checks in TypeScript — one schema, three consumers, no drift.
 *
 * Goes through SchemaRegistry rather than compiling its own Ajv. Two instances meant two
 * chances to get the dialect wrong, and one of them did: every schema in
 * packages/shared-schema declares draft 2020-12, while `ajv`'s default export is the draft-07
 * class. The registry uses `ajv/dist/2020`, which is the dialect the Python side enforces.
 */
@Injectable()
export class SnapshotValidator {
  constructor(private readonly schemas: SchemaRegistry) {}

  validate(payload: unknown): ValidationResult {
    const validateFn = this.schemas.validator("signal-snapshot");
    if (validateFn(payload)) {
      return { ok: true, value: payload as SignalSnapshot };
    }
    const errors = (validateFn.errors ?? []).map(
      // Path + keyword only. Never echo the value back: it is a biometric. `error.message` is
      // avoided too — ajv interpolates the offending data into some of them.
      (error) => `${error.instancePath || "/"} failed '${error.keyword}'`,
    );
    return { ok: false, errors };
  }
}
