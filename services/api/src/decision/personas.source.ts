import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Injectable, NotFoundException } from "@nestjs/common";
import type { SignalSnapshot } from "@weyos/shared-schema";

import { DEMO_FIXTURES_DIR } from "../paths";

const FIXTURES = join(DEMO_FIXTURES_DIR, "personas.json");

export type PersonaId = "sarah" | "james" | "alex";
export type PersonaState = "calm" | "crash";

/** `subject_ref` is the real key. The persona name is a demo convenience on top of it. */
const BY_SUBJECT: Record<string, PersonaId> = {
  sub_persona01: "sarah",
  sub_persona02: "james",
  sub_persona03: "alex",
};

export interface Selector {
  subjectRef?: string;
  persona?: PersonaId;
  state?: PersonaState;
  elemental?: boolean;
}

function stripMeta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMeta);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !k.startsWith("$"))
        .map(([k, v]) => [k, stripMeta(v)]),
    );
  }
  return value;
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) {
    const existing = out[key];
    out[key] =
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing)
        ? deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return out;
}

/**
 * Where snapshots come from until persistence lands.
 *
 * Shaped around `subject_ref` on purpose, because that is what the real system will key on:
 * auth resolves a subject, the subject has a latest snapshot. When `TODO(VEY-INGEST-2)` is
 * done, only this class changes — `DecisionService` and every controller stay put.
 *
 * The demo shortcut (`?persona=`) is gated behind `WEYOS_DEMO_FIXTURES`. Hard constraint 12:
 * no fake interventions in a production build.
 */
@Injectable()
export class PersonaSource {
  private readonly personas: Record<string, { calm: unknown; crash: unknown }>;
  readonly demoEnabled = (process.env.WEYOS_DEMO_FIXTURES ?? "true") !== "false";

  constructor() {
    this.personas = stripMeta(JSON.parse(readFileSync(FIXTURES, "utf-8"))) as Record<
      string,
      { calm: unknown; crash: unknown }
    >;
  }

  resolve(selector: Selector): { persona: PersonaId; snapshot: SignalSnapshot } {
    const persona = this.identify(selector);
    const entry = this.personas[persona];
    if (entry === undefined) throw new NotFoundException({ error: "unknown_subject" });

    const base = entry.calm as Record<string, unknown>;
    const snapshot =
      selector.state === "crash" ? deepMerge(base, entry.crash as Record<string, unknown>) : base;
    return { persona, snapshot: snapshot as unknown as SignalSnapshot };
  }

  private identify(selector: Selector): PersonaId {
    if (selector.subjectRef !== undefined) {
      const persona = BY_SUBJECT[selector.subjectRef];
      if (persona === undefined) throw new NotFoundException({ error: "unknown_subject" });
      return persona;
    }
    if (selector.persona !== undefined) {
      if (!this.demoEnabled) throw new NotFoundException({ error: "unknown_subject" });
      return selector.persona;
    }
    throw new NotFoundException({ error: "unknown_subject" });
  }

  /** Every selector the demo matrix covers, for cache warm-up. */
  matrix(): Selector[] {
    const out: Selector[] = [];
    for (const persona of ["sarah", "james", "alex"] as PersonaId[]) {
      for (const state of ["calm", "crash"] as PersonaState[]) {
        for (const elemental of [true, false]) {
          out.push({ persona, state, elemental });
        }
      }
    }
    return out;
  }
}
