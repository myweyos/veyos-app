/**
 * @weyos/demo-fixtures — scripted personas for the Stage 1 demo.
 *
 * Dev/demo only. Nothing here may reach a production build: the app runs on real signals,
 * and a fixture that survives into production is a fake intervention.
 *
 * The JSON files are the truth and are language-neutral, exactly as
 * packages/shared-schema/schemas are. Python reads the same files from
 * services/engine/demo_driver, and the two implementations are pinned to the committed
 * `expected/` output so they cannot drift.
 */

import appStates from "../app-states.json";
import alexProfile from "../profiles/alex.json";
import jamesProfile from "../profiles/james.json";
import sarahProfile from "../profiles/sarah.json";
import alexScenario from "../scenarios/alex.json";
import jamesScenario from "../scenarios/james.json";
import sarahScenario from "../scenarios/sarah.json";

import type { AppStateMapping, PersonaId, Profile, Scenario } from "./types";

export * from "./types";
export * from "./clock";
export * from "./appState";

export const PERSONA_IDS: readonly PersonaId[] = ["sarah", "james", "alex"] as const;

const PROFILES: Record<PersonaId, unknown> = {
  sarah: sarahProfile,
  james: jamesProfile,
  alex: alexProfile,
};

const SCENARIOS: Record<PersonaId, unknown> = {
  sarah: sarahScenario,
  james: jamesScenario,
  alex: alexScenario,
};

/**
 * The 3-to-6 app-state mapping, with its open questions attached.
 *
 * Read `status` before shipping anything that depends on it: as of writing it is PROPOSED and
 * every entry in `open_questions` needs a human ruling.
 */
export const APP_STATE_MAPPING = appStates as unknown as AppStateMapping;

export function getProfile(persona: PersonaId): Profile {
  return PROFILES[persona] as Profile;
}

export function getScenario(persona: PersonaId): Scenario {
  return SCENARIOS[persona] as Scenario;
}

/**
 * Build the rule-id-to-layer map the app-state derivation needs.
 *
 * Takes it from a Decision's own fired_rules plus whatever else the caller knows, rather than
 * parsing "1.1" for its leading digit. The API is the real source once /decision/today lands.
 */
export function layerMapFromDecision(
  firedRules: ReadonlyArray<{ rule_id: string; layer: number }>,
): ReadonlyMap<string, number> {
  return new Map(firedRules.map((rule) => [rule.rule_id, rule.layer]));
}
