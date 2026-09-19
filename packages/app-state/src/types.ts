/**
 * Shapes for the 3-to-6 app-state mapping.
 *
 * Client-side types only. Anything that crosses a service boundary belongs in
 * @weyos/shared-schema.
 */

/** The six product states. The engine only emits three — see app-states.json. */
export type AppStateId =
  | "calibrating"
  | "partial"
  | "in_balance"
  | "advisory"
  | "intervention"
  | "declined";

/**
 * Client-side facts the engine never sees.
 *
 * This is the seam that keeps the engine pure. Permissions and user responses are consumed
 * only by the app-state derivation and are never merged into a snapshot.
 */
export interface ClientState {
  user_response?: "accepted" | "declined" | "later";
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
