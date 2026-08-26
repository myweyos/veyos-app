/**
 * Deriving the six app states from a three-state Decision, TypeScript side.
 *
 * The mapping itself is DATA — ../app-states.json — because several of its edges are open
 * spec questions and deciding them in an if-statement would resolve them silently. This
 * module implements the named predicates and walks the ordered list. It decides nothing.
 *
 * Mirrors services/engine/demo_driver/app_state.py. Semantics are tested once, in Python,
 * over the same JSON; the two implementations are pinned to the committed `expected/` output.
 */

import type { Decision } from "@weyos/shared-schema";

import type { AppStateId, AppStateMapping, ClientState, PredicateId } from "./types";

const TRACE_STEP_EVALUATE = "evaluate";
const TRACE_UNEVALUABLE = "unevaluable";
const BIOMETRIC_LAYER = 1;

/** Rule ids whose conditions came out UNKNOWN, recovered from the engine's own trace. */
export function unevaluableRuleIds(decision: Decision): string[] {
  return decision.trace
    .filter(
      (row) =>
        row.step === TRACE_STEP_EVALUATE &&
        row.detail.split(":", 1)[0]?.trim() === TRACE_UNEVALUABLE,
    )
    .map((row) => row.rule_id);
}

type Predicate = (
  decision: Decision,
  client: ClientState,
  layerOf: ReadonlyMap<string, number>,
) => boolean;

const PREDICATES: Record<PredicateId, Predicate> = {
  user_declined: (_decision, client) => client.user_response === "declined",

  engine_state_is_insufficient_baseline: (decision) => decision.state === "insufficient_baseline",

  engine_state_is_intervention_and_activity_restricted: (decision) =>
    decision.state === "intervention" && decision.activity.verdict !== "allow",

  /**
   * A Layer 1 rule could not be evaluated.
   *
   * Restricted to Layer 1 deliberately, and it is the most contested line here. The engine
   * maps an ABSENT signal to UNKNOWN identically to one that failed to sync, so a subject
   * with no cycle has 2.1-2.4 unevaluable every day and a subject with no labs has 5.1-5.3
   * unevaluable every day. Counting those would make every non-cycling subject permanently
   * "partial" and would make "in balance" unreachable for them. See app-states.json, open
   * question "partial-is-narrowed-to-layer-1".
   */
  has_unevaluable_biometric_rules: (decision, _client, layerOf) =>
    unevaluableRuleIds(decision).some((id) => layerOf.get(id) === BIOMETRIC_LAYER),

  engine_state_is_intervention: (decision) => decision.state === "intervention",

  engine_state_is_calm: (decision) => decision.state === "calm",
};

/**
 * First match wins, reading app-states.json top to bottom.
 *
 * `layerOf` maps rule id to layer and comes from the rulebook, so nothing here parses a rule
 * id string to guess its layer.
 */
export function deriveAppState(
  decision: Decision,
  mapping: AppStateMapping,
  layerOf: ReadonlyMap<string, number>,
  client: ClientState = {},
): AppStateId {
  for (const state of mapping.states) {
    const predicate = PREDICATES[state.predicate];
    if (predicate === undefined) {
      throw new Error(
        `app-states.json names predicate '${state.predicate}', which appState.ts does not ` +
          `implement. Keep it in step with demo_driver/app_state.py.`,
      );
    }
    if (predicate(decision, client, layerOf)) return state.id;
  }
  throw new Error(
    `no app state matched a decision in engine state '${decision.state}'. ` +
      `app-states.json must be exhaustive over the engine's three states.`,
  );
}
