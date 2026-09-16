// node --test tools/copy-lint/lint.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractFromRulebook, extractFromTs, findTerms, indexTerms, lintEntries,
} from "./lint.mjs";

const TERMS = JSON.parse(readFileSync(new URL("./terms.json", import.meta.url), "utf8"));
const INDEX = indexTerms(TERMS);

const texts = (file, src) => extractFromTs(file, src).map((e) => e.text);
const heads = (text) => findTerms(text, INDEX).map((h) => h.head);
const lintTs = (src, exceptions = [], file = "a.tsx") =>
  lintEntries(file, extractFromTs(file, src), INDEX, exceptions);

// --------------------------------------------------------------------- the word list

test("every term the ticket names is banned", () => {
  const ticket = ["detect", "diagnose", "risk", "prevent", "treat", "symptom", "condition",
    "disorder", "abnormal", "medical", "cardiac", "patient", "prescribe",
    "should", "must", "failed", "missed", "streak"];
  for (const word of ticket) assert.deepEqual(heads(word), [word], word);
});

test("inflections and case are caught, look-alikes are not", () => {
  assert.deepEqual(heads("Detected early"), ["detect"]);
  assert.deepEqual(heads("a risk-free day"), ["risk"]);
  assert.deepEqual(heads("You shouldn’t"), ["should"]);
  assert.deepEqual(heads("Missing data. Be patient."), ["patient"]);
  assert.deepEqual(heads("Patience. Conditioning. Mustard. Treaty."), []);
});

test("type labels and trait names are banned in copy (SCRUM-91)", () => {
  assert.deepEqual(heads("You're Kapha-Pitta"), ["kapha", "pitta"]);
  assert.deepEqual(heads("Your dosha"), ["dosha"]);
  assert.deepEqual(heads("Regularity: 30"), ["regularity"]);
  assert.deepEqual(heads("Your body keeps a regular rhythm."), []);
  // Field names stay fine: it's the rendered word that's banned.
  assert.deepEqual(lintTs(`const d = profile.dosha; if (axis === "T5") {}`).violations, []);
});

// --------------------------------------------------------------------- what counts as copy

test("JSX text, string literals and template text are copy", () => {
  const src = `
    const a = "You missed a day";
    const b = \`Your \${x} streak\`;
    export const C = () => <Text>We detect patterns</Text>;
    export const D = () => <Pressable accessibilityLabel="Prescribed session" />;
  `;
  const found = lintTs(src).violations.map((v) => v.head).sort();
  assert.deepEqual(found, ["detect", "missed", "prescribe", "streak"]);
});

test("comments are never scanned", () => {
  const src = `
    /** BANNED VOCABULARY. Never: detect, diagnose, risk. */
    // this must never happen
    /* failed */
    const ok = "Rest today";
  `;
  assert.deepEqual(lintTs(src).violations, []);
});

test("field names and code tokens are not copy", () => {
  const src = `
    import x from "./prescribed";
    type V = "streak" | "failed";
    const p = activity.prescribed;
    const q = activity["prescribed"];
    const r = { prescribed: 1, "must": 2 };
    if (state === "failed") {}
    if ("risk" in obj) {}
    switch (s) { case "missed": break; }
    const t = <View testID="treatment-row" />;
  `;
  assert.deepEqual(lintTs(src).violations, []);
});

test("a field name rendered as a label IS copy", () => {
  const src = `export const L = () => <Text>Prescribed: {activity.prescribed}</Text>;`;
  assert.deepEqual(lintTs(src).violations.map((v) => v.head), ["prescribe"]);
});

// --------------------------------------------------------------------- exceptions

const DISCLAIMER = {
  file: "tokens.ts", text: "Wellness guidance, not medical advice.", terms: ["medical"],
  reason: "the disclaimer", approved_in: "test",
};

test("an exception allows its listed terms in its exact string only", () => {
  const src = `export const W = "Wellness guidance, not medical advice.";`;
  const { violations, used } = lintTs(src, [DISCLAIMER], "tokens.ts");
  assert.deepEqual(violations, []);
  assert.deepEqual([...used], [0]);
});

test("an exception does not cover a reworded string, another file, or another term", () => {
  const reworded = lintTs(`const W = "Wellness guidance, not medical advice!";`, [DISCLAIMER], "tokens.ts");
  assert.equal(reworded.violations.length, 1);
  assert.equal(reworded.used.size, 0);

  const elsewhere = lintTs(`const W = "Wellness guidance, not medical advice.";`, [DISCLAIMER], "other.ts");
  assert.equal(elsewhere.violations.length, 1);

  const widened = { ...DISCLAIMER, text: "Not medical advice. You must rest." };
  const extra = lintTs(`const W = "Not medical advice. You must rest.";`, [widened], "tokens.ts");
  assert.deepEqual(extra.violations.map((v) => v.head), ["must"]);
});

// --------------------------------------------------------------------- rulebook

test("rulebook: names, messages, activity suggestions and added items are copy", () => {
  const yaml = `
rules:
  - id: "9.1"
    name: "Symptom Watch"
    layer: 1
    priority: 1
    when: { all: [{ signal: hrv_ms, op: gte, value: 1 }] }
    effects:
      activity: { verdict: substitute, suggestions: ["treatment walk"], downgrade_to: ["walking"] }
      food: { add_items: [{ name: "cardiac tea", tags: [warm] }], block_tags: [raw] }
      message: "You failed to recover."
`;
  const entries = extractFromRulebook(yaml);
  assert.deepEqual(entries.map((e) => e.where), [
    "rule 9.1 name", "rule 9.1 message", "rule 9.1 activity.suggestions",
    "rule 9.1 activity.downgrade_to", "rule 9.1 food.add_items name",
  ]);
  const found = lintEntries("r.yaml", entries, INDEX, []).violations.map((v) => v.head);
  assert.deepEqual(found.sort(), ["cardiac", "failed", "symptom", "treat"]);
  assert.equal(entries[0].line, 4);
});

test("rulebook: signal names, ops and tags are not copy", () => {
  const yaml = `
rules:
  - id: "9.2"
    name: "Quiet"
    when: { all: [{ signal: condition_index, op: gte, value: 1 }] }
    effects: { food: { block_tags: [risky_tag] } }
`;
  assert.deepEqual(extractFromRulebook(yaml).map((e) => e.text), ["Quiet"]);
});

// --------------------------------------------------------------------- the CLI, as CI runs it

test("the CLI exits 1 when a change introduces a banned term", () => {
  const root = mkdtempSync(join(tmpdir(), "copy-lint-"));
  try {
    mkdirSync(join(root, "apps", "mobile", "src"), { recursive: true });
    mkdirSync(join(root, "config", "rules"), { recursive: true });
    writeFileSync(join(root, "apps", "mobile", "src", "New.tsx"),
      "export const N = () => <Text>Don't break your streak</Text>;\n");
    writeFileSync(join(root, "config", "rules", "rules.v1.yaml"), "rules: []\n");

    const cli = fileURLToPath(new URL("./check.mjs", import.meta.url));
    const run = spawnSync(process.execPath, [cli], {
      env: { ...process.env, COPY_LINT_ROOT: root }, encoding: "utf8",
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /apps\/mobile\/src\/New\.tsx:1:\d+ {2}"streak" is banned tone/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the mobile copy module's own header is not flagged", () => {
  const src = readFileSync(new URL("../../apps/mobile/src/screens/copy.ts", import.meta.url), "utf8");
  assert.ok(texts("copy.ts", src).length > 10, "extractor found the copy");
  assert.deepEqual(lintTs(src, [], "copy.ts").violations, []);
});
