import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Injectable } from "@nestjs/common";
// `ajv`'s default export is the draft-07 class. Every schema in packages/shared-schema
// declares draft 2020-12, and registering one on the draft-07 class fails with "no schema
// with key or ref https://json-schema.org/draft/2020-12/schema". Ajv2020 is the right class,
// and it is also what makes $ref BETWEEN schemas resolve by $id — decision-envelope.json
// references decision.json by its published URI.
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

import { SCHEMA_DIR } from "../paths";

/**
 * Compiles every published schema once, from the SAME files the engine's contract tests read.
 *
 * Two validators exist across the stack — ajv here, jsonschema in Python — and that is fine,
 * because both consume the same artefact. What is not fine is a hand-written check that
 * re-encodes what a schema already says: that is the drift `snapshot.validator.ts` warns
 * about, and it is why this is a registry rather than a second copy of the ajv incantation.
 *
 * Runtime note: schemas are read by relative path off `__dirname`, so the API depends on the
 * monorepo layout being present on disk. A container copying only `services/api` throws at DI
 * construction — loudly, at boot, which is the right time to find out.
 */
@Injectable()
export class SchemaRegistry {
  private readonly ajv: Ajv2020;
  private readonly compiled = new Map<string, ValidateFunction>();

  constructor() {
    // strict:false because the schemas are draft 2020-12 with keywords ajv's strict mode
    // rejects; allErrors so a caller can report every problem, not just the first.
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(this.ajv);

    // Register by $id first so $ref between schemas resolves — decision-envelope.json
    // references decision.json by its published URI.
    for (const name of ["signal-snapshot", "decision", "decision-envelope"]) {
      const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, `${name}.schema.json`), "utf-8"));
      this.ajv.addSchema(schema, name);
    }
  }

  validator(name: string): ValidateFunction {
    const existing = this.compiled.get(name);
    if (existing !== undefined) return existing;
    const fn = this.ajv.getSchema(name);
    if (fn === undefined) throw new Error(`no schema registered as '${name}'`);
    this.compiled.set(name, fn);
    return fn;
  }

  /**
   * Structural description of the first violation, or null.
   *
   * Path and rule keyword only — never `error.data`, and never ajv's message with the value
   * interpolated. Error payloads get logged, and these are biometrics.
   */
  firstProblem(name: string, payload: unknown): string | null {
    const fn = this.validator(name);
    if (fn(payload)) return null;
    const first = (fn.errors ?? [])[0];
    if (first === undefined) return "invalid";
    return `${first.instancePath || "/"} failed '${first.keyword}'`;
  }
}
