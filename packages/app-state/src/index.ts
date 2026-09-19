/**
 * @weyos/app-state — the six product states, derived from a Decision.
 *
 * The engine emits three states; the design needs six. The mapping is DATA (app-states.json)
 * because several of its edges are open spec questions. Read its `status` and
 * `open_questions` before depending on it: it is PROPOSED, not signed off.
 */

import appStates from "../app-states.json";

import type { AppStateMapping } from "./types";

export * from "./types";
export * from "./appState";

export const APP_STATE_MAPPING = appStates as unknown as AppStateMapping;

/**
 * Rule id → layer, from the rulebook listing the API serves at `/v1/rulebook`.
 *
 * Taken from the rulebook itself rather than by parsing "1.1" for its leading digit, so a
 * renumbered or re-layered rule can't be misclassified.
 */
export function layerMap(
  rules: ReadonlyArray<{ id: string; layer: number }>,
): ReadonlyMap<string, number> {
  return new Map(rules.map((rule) => [rule.id, rule.layer]));
}
