import { APP_STATE_MAPPING, deriveAppState, layerMap, type AppStateId, type ClientState } from "@weyos/app-state";
import type { DecisionEnvelope, SignalSnapshot } from "@weyos/shared-schema";

import type { RulebookListing } from "./api";

/**
 * Everything the Today, takeover and trace screens render: the stored decision, the snapshot
 * it was computed from, and the app state derived from them.
 *
 * The app state comes from @weyos/app-state (data, PROPOSED), with rule layers taken from the
 * served rulebook, never from parsing a rule id. Nothing here decides anything about the body:
 * the engine already did, at ingest.
 */
export interface TodayModel {
  envelope: DecisionEnvelope;
  decision: DecisionEnvelope["decision"];
  snapshot: SignalSnapshot | null;
  appState: AppStateId;
  layerOf: ReadonlyMap<string, number>;
}

export function buildToday(
  envelope: DecisionEnvelope,
  snapshot: SignalSnapshot | null,
  rulebook: RulebookListing,
  client: ClientState = {},
): TodayModel {
  const layerOf = layerMap(rulebook.rules);
  return {
    envelope,
    decision: envelope.decision,
    snapshot,
    appState: deriveAppState(envelope.decision, APP_STATE_MAPPING, layerOf, client),
    layerOf,
  };
}
