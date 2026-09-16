import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MODULE_J,
  band,
  describe,
  personalises,
  requiredItems,
  score,
  scoredItems,
  validateAnswers,
  type Answers,
} from "../src/index";

/** Chris McPherson's answers, from the advisory pack's worked example. */
const CHRIS: Answers = { J1: 1, J2a: 4, J2b: 2, J3: 2, J4a: 4, J4b: 4, J5: 4, J6: 4, J7: 3, J8a: 5, J8b: 4 };

test("reproduces the worked example's six axis scores exactly", () => {
  const t = score(CHRIS);
  assert.deepEqual(
    Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.score])),
    { T1: 25, T2: 75, T3: 52.5, T4: 60, T5: 30, T6: 90 },
  );
});

test("T5 worked in full: normalise(0.6·J7 + 0.4·J1) = normalise(2.2) = 30", () => {
  assert.equal(score({ ...CHRIS, J7: 3, J1: 1 }).T5.score, 30);
});

test("J3 is inverted in T2 only: a fast talker counts against a steady energy curve", () => {
  const fast = score({ ...CHRIS, J3: 5 });
  const slow = score({ ...CHRIS, J3: 1 });
  assert.ok(fast.T2.score < slow.T2.score, "T2 falls as J3 rises");
  assert.ok(fast.T4.score > slow.T4.score, "T4 rises as J3 rises");
});

test("reads back Chris's four sentences, pair rule applied, in trait order", () => {
  assert.deepEqual(describe(score(CHRIS)), [
    { key: "T1+T2", text: "You're a slow starter who runs steady once you're going." },
    { key: "T4", text: "Under pressure you get direct and push for a resolution." },
    { key: "T5", text: "Your rhythm varies a lot day to day at the moment." },
    { key: "T6", text: "You bounce back quickly from a hard day." },
  ]);
});

test("a middling score produces no sentence: T3 at 52.5 is silent", () => {
  assert.equal(band(52.5), "mid");
  assert.ok(!describe(score(CHRIS)).some((f) => f.key === "T3"));
  assert.equal(band(40), "low");
  assert.equal(band(60), "high");
  assert.equal(band(41), "mid");
  assert.equal(band(59), "mid");
});

test("all-middle answers describe nothing at all, rather than padding", () => {
  const flat: Answers = Object.fromEntries(requiredItems().map((id) => [id, 3]));
  assert.deepEqual(describe(score(flat)), []);
});

test("at most four fragments, the most distinctive kept", () => {
  const extreme: Answers = { J1: 5, J2a: 5, J2b: 5, J3: 1, J4a: 5, J4b: 5, J5: 5, J6: 5, J7: 5, J8a: 5, J8b: 5 };
  const frags = describe(score(extreme));
  assert.equal(frags.length, 4);
});

test("self-report at signup sits below the personalisation gate; T4 is capped for good", () => {
  const t = score(CHRIS);
  for (const trait of Object.values(t)) assert.equal(personalises(trait), false);
  assert.equal(t.T1.confidence, 0.4);
  const device = score(CHRIS, "device_agrees");
  assert.equal(device.T1.confidence, 0.85);
  assert.equal(device.T4.confidence, 0.6, "no device proxy exists for stress expression");
  assert.equal(personalises(device.T1), true);
});

test("invalid answers are refused, never scored", () => {
  assert.deepEqual(validateAnswers({ ...CHRIS, J7: 6 }), ["J7: not an integer in 1–5"]);
  const { J1: _omit, ...missing } = CHRIS;
  assert.deepEqual(validateAnswers(missing), ["J1: missing"]);
  assert.throws(() => score(missing), /invalid answers/);
});

test("the instrument is internally consistent", () => {
  const ids = new Set(MODULE_J.items.map((i) => i.id));
  for (const axis of MODULE_J.axes) {
    const total = axis.terms.reduce((n, t) => n + t.weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${axis.id} weights sum to 1`);
    for (const term of axis.terms) assert.ok(ids.has(term.item), `${axis.id} uses a real item`);
  }
  assert.deepEqual(requiredItems().length, 11);
  assert.ok(!scoredItems().includes("J8b"), "J8b carries no weight in v1.0");
  for (const axis of MODULE_J.axes) {
    assert.ok(MODULE_J.description.fragments[axis.id], `${axis.id} has fragments`);
  }
});
