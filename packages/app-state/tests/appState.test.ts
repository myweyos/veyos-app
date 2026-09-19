import assert from "node:assert/strict";
import { test } from "node:test";

import type { Decision } from "@weyos/shared-schema";

import { APP_STATE_MAPPING, deriveAppState, layerMap, unevaluableRuleIds } from "../src/index";
import type { AppStateMapping } from "../src/types";

// Layers as the rulebook assigns them. In the app this comes from /v1/rulebook.
const LAYERS = layerMap([
  { id: "1.1", layer: 1 }, { id: "1.2", layer: 1 }, { id: "1.3", layer: 1 },
  { id: "2.1", layer: 2 }, { id: "2.3", layer: 2 },
  { id: "3.3", layer: 3 }, { id: "4.1", layer: 4 }, { id: "5.1", layer: 5 },
]);

type Verdict = Decision["activity"]["verdict"];

function decision(
  state: Decision["state"],
  opts: { verdict?: Verdict; unevaluable?: string[] } = {},
): Decision {
  return {
    schema_version: 1,
    subject_ref: "sub_test0001",
    as_of: "2026-09-01",
    rulebook_version: 1,
    state,
    fired_rules: [],
    activity: { verdict: opts.verdict ?? "allow", planned: "run", prescribed: "run", location: null, decided_by: null },
    food: { meals: [], mandated_tags: [], blocked_tags: [] },
    supplements: [],
    trace: (opts.unevaluable ?? []).map((id) => ({
      step: "evaluate" as const,
      rule_id: id,
      detail: "unevaluable: signal not available",
    })),
  } as Decision;
}

const derive = (d: Decision, declined = false) =>
  deriveAppState(d, APP_STATE_MAPPING, LAYERS, declined ? { user_response: "declined" } : {});

test("calm with nothing missing is in balance", () => {
  assert.equal(derive(decision("calm")), "in_balance");
});

test("cold start is calibrating", () => {
  assert.equal(derive(decision("insufficient_baseline")), "calibrating");
});

test("an intervention that restricts the plan is an intervention", () => {
  for (const verdict of ["rest", "substitute", "downgrade", "relocate"] as const) {
    assert.equal(derive(decision("intervention", { verdict })), "intervention", verdict);
  }
});

test("an intervention that leaves the plan alone is advisory", () => {
  assert.equal(derive(decision("intervention", { verdict: "allow" })), "advisory");
});

test("an unevaluable Layer 1 rule makes a calm day partial, not in balance", () => {
  assert.equal(derive(decision("calm", { unevaluable: ["1.3"] })), "partial");
});

test("partial counts Layer 1 only: no cycle or no labs is not partial", () => {
  // Open question partial-is-narrowed-to-layer-1: absent cycle and lab data read as UNKNOWN.
  assert.equal(derive(decision("calm", { unevaluable: ["2.1", "2.3", "5.1"] })), "in_balance");
});

test("priority: declined > calibrating > intervention > partial > advisory > in balance", () => {
  assert.equal(derive(decision("intervention", { verdict: "rest" }), true), "declined");
  assert.equal(derive(decision("intervention", { verdict: "rest", unevaluable: ["1.2"] })), "intervention");
  assert.equal(derive(decision("intervention", { verdict: "allow", unevaluable: ["1.2"] })), "partial");
});

test("the mapping covers all three engine states", () => {
  for (const state of ["calm", "intervention", "insufficient_baseline"] as const) {
    assert.doesNotThrow(() => derive(decision(state)));
  }
});

test("an unknown predicate fails loudly instead of skipping a state", () => {
  const broken = {
    ...APP_STATE_MAPPING,
    states: [{ ...APP_STATE_MAPPING.states[0], predicate: "not_a_predicate" }],
  } as unknown as AppStateMapping;
  assert.throws(() => deriveAppState(decision("calm"), broken, LAYERS), /not_a_predicate/);
});

test("unevaluable ids come from evaluate rows only", () => {
  const d = decision("calm", { unevaluable: ["1.1"] });
  d.trace.push({ step: "food", rule_id: "3.3", detail: "unevaluable-looking but not an evaluate row" });
  assert.deepEqual(unevaluableRuleIds(d), ["1.1"]);
});

test("the mapping is still marked proposed until someone signs it off", () => {
  assert.match(APP_STATE_MAPPING.status, /PROPOSED/);
  assert.ok(APP_STATE_MAPPING.open_questions.length > 0);
});
