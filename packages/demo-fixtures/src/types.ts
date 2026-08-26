/**
 * Shapes of the demo-fixture data files.
 *
 * These describe the JSON in this package. They are NOT contract types — anything that
 * crosses a service boundary belongs in @weyos/shared-schema. Profiles and scenarios are
 * demo scaffolding and deliberately never reach a snapshot: signal-snapshot.schema.json sets
 * additionalProperties:false at every level, so adding `region` or `scenario` to a payload
 * would be a contract change.
 */

import type { SignalSnapshot } from "@weyos/shared-schema";

/** The six product states. The engine only emits three — see app-states.json. */
export type AppStateId =
  | "calibrating"
  | "partial"
  | "in_balance"
  | "advisory"
  | "intervention"
  | "declined";

export type Region = "UK" | "US";

export type PersonaId = "sarah" | "james" | "alex";

/** A snapshot-shaped partial override. Same semantics as golden.yaml's `overrides`. */
export type SnapshotPatch = Partial<SignalSnapshot> & Record<string, unknown>;

/**
 * Client-side facts the engine never sees.
 *
 * This is the seam that keeps the engine pure. Permissions and user responses are consumed
 * only by the app-state derivation and are never merged into a snapshot.
 */
export interface ClientState {
  user_response?: "accepted" | "declined" | "later";
}

export interface ScenarioDay {
  day: number;
  label: string;
  /** Selects the persona's calm base or deep-merges its crash delta. */
  state?: "calm" | "crash";
  patch?: SnapshotPatch;
  client?: ClientState;
  expect?: {
    engine_state?: string;
    app_state?: AppStateId;
    fired?: string[];
    activity_verdict?: string;
    unevaluable_includes?: string[];
    /** Golden fixture ids that already assert the engine behaviour for this day. */
    pins?: string[];
  };
}

export interface Scenario {
  id: string;
  persona: PersonaId;
  start_date: string;
  start_cycle_day: number | null;
  days: ScenarioDay[];
}

export interface Profile {
  persona: PersonaId;
  display_name: string;
  region: Region;
  scenario: string;
  planned_activity_override: NonNullable<SignalSnapshot["planned_activity"]>;
  app_states: Record<AppStateId, { reachable: boolean; via?: string }>;
}

/** A named predicate implemented by appState.ts and referenced from app-states.json. */
export type PredicateId =
  | "user_declined"
  | "engine_state_is_insufficient_baseline"
  | "engine_state_is_intervention_and_activity_restricted"
  | "has_unevaluable_biometric_rules"
  | "engine_state_is_intervention"
  | "engine_state_is_calm";

export interface AppStateRule {
  id: AppStateId;
  display: string;
  glyph: string;
  predicate: PredicateId;
  input: string;
  why: string;
}

export interface AppStateMapping {
  version: number;
  status: string;
  resolution: string;
  /** Ordered. First match wins — the order IS the priority. */
  states: AppStateRule[];
  open_questions: Array<{
    id: string;
    question: string;
    why_it_bites: string;
    what_this_file_does: string;
    needs: string;
  }>;
}
