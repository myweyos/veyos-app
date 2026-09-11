/**
 * Schema validity tests for packages/shared-schema (SCRUM-24).
 *
 * Verifies that:
 *   1. All .schema.json files compile as valid JSON Schema draft-2020-12.
 *   2. Known-good payloads validate against each schema.
 *   3. Known-bad payloads are rejected (required fields, enum constraints).
 *   4. LabValue correctly accepts null (regression for the oneOf fix).
 *   5. FiredRule.layer rejects out-of-range integers (regression for enum fix).
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const SCHEMAS_DIR = path.resolve(__dirname, "../schemas");

function loadSchema(file) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, file), "utf8"));
}

function makeAjv() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv;
}

// ---------------------------------------------------------------------------
// Minimal valid fixtures
// ---------------------------------------------------------------------------

const VALID_SNAPSHOT = {
  schema_version: 1,
  subject_ref: "sub_testABCD1234",
  as_of: "2026-09-10",
  constitution: { dosha: "vata" },
};

const VALID_SNAPSHOT_WITH_LABS = {
  ...VALID_SNAPSHOT,
  labs: {
    pm_cortisol: { status: "normal", value: 12.5, unit: "nmol/L" },
    hs_crp: null,
    hba1c: { status: "high", value: 6.8 },
  },
};

const VALID_DECISION = {
  schema_version: 1,
  subject_ref: "sub_testABCD1234",
  as_of: "2026-09-10",
  rulebook_version: 1,
  state: "calm",
  fired_rules: [
    { rule_id: "3.1", layer: 3, priority: 100 },
  ],
  activity: { verdict: "allow" },
  food: { meals: [] },
  supplements: [],
  trace: [],
};

const VALID_DECISION_WITH_FOOD = {
  ...VALID_DECISION,
  food: {
    meals: [
      {
        slot: "dinner",
        items: [{ name: "Dal", tags: ["warm", "cooked"] }],
        removed: [{ name: "Salad", rule_id: "3.1", reason: "blocked tag: raw" }],
      },
    ],
  },
};

const VALID_ENVELOPE = {
  envelope_version: 1,
  decision_id: "a1b2c3d4e5f60718",
  decision: VALID_DECISION,
  presentation: {
    fired_layers: [3],
    unevaluable_rule_ids: [],
    suppressed_rule_ids: [],
    warning_kinds: [],
  },
  engine: { rulebook_version: 1, elemental_layer_enabled: false },
};

// ---------------------------------------------------------------------------
// 1. Schema compilation
// ---------------------------------------------------------------------------

describe("Schema files compile as draft-2020-12", () => {
  const standaloneFiles = [
    "signal-snapshot.schema.json",
    "decision.schema.json",
  ];

  for (const file of standaloneFiles) {
    test(`compiles standalone: ${file}`, () => {
      const ajv = makeAjv();
      const schema = loadSchema(file);
      assert.doesNotThrow(
        () => ajv.compile(schema),
        `${file} should compile without errors`
      );
    });
  }

  test("compiles: decision-envelope.schema.json (with cross-refs pre-loaded)", () => {
    // decision-envelope references decision.json via $id URI — must pre-load it.
    const ajv = makeAjv();
    ajv.addSchema(
      loadSchema("signal-snapshot.schema.json"),
      "https://schema.weyos.app/v1/signal-snapshot.json"
    );
    ajv.addSchema(
      loadSchema("decision.schema.json"),
      "https://schema.weyos.app/v1/decision.json"
    );
    assert.doesNotThrow(
      () => ajv.compile(loadSchema("decision-envelope.schema.json")),
      "decision-envelope.schema.json should compile when dependencies are pre-loaded"
    );
  });
});

// ---------------------------------------------------------------------------
// 2. SignalSnapshot — valid payloads
// ---------------------------------------------------------------------------

describe("SignalSnapshot — valid payloads", () => {
  const schema = loadSchema("signal-snapshot.schema.json");
  let validate;

  test("setup: schema compiles", () => {
    const ajv = makeAjv();
    validate = ajv.compile(schema);
  });

  test("minimal snapshot (required fields only) is valid", () => {
    const ok = validate(VALID_SNAPSHOT);
    assert.ok(ok, JSON.stringify(validate.errors));
  });

  test("snapshot with labs (object LabValue) is valid", () => {
    const ok = validate({
      ...VALID_SNAPSHOT,
      labs: { pm_cortisol: { status: "normal" } },
    });
    assert.ok(ok, JSON.stringify(validate.errors));
  });

  test("LabValue null is valid (oneOf fix regression)", () => {
    const ok = validate({
      ...VALID_SNAPSHOT,
      labs: { pm_cortisol: null, hs_crp: null },
    });
    assert.ok(ok, JSON.stringify(validate.errors));
  });

  test("mixed null and object labs are valid", () => {
    const ok = validate(VALID_SNAPSHOT_WITH_LABS);
    assert.ok(ok, JSON.stringify(validate.errors));
  });

  test("all dosha values are accepted", () => {
    for (const dosha of ["vata", "pitta", "kapha"]) {
      const ok = validate({ ...VALID_SNAPSHOT, constitution: { dosha } });
      assert.ok(ok, `dosha=${dosha} should be valid`);
    }
  });

  test("missing required field 'constitution' is rejected", () => {
    const { constitution: _, ...bad } = VALID_SNAPSHOT;
    const ok = validate(bad);
    assert.equal(ok, false, "snapshot without constitution must fail");
  });

  test("invalid subject_ref pattern is rejected", () => {
    const ok = validate({ ...VALID_SNAPSHOT, subject_ref: "plain-name" });
    assert.equal(ok, false, "subject_ref not matching pattern must fail");
  });

  test("unknown dosha is rejected", () => {
    const ok = validate({ ...VALID_SNAPSHOT, constitution: { dosha: "tridosha" } });
    assert.equal(ok, false, "unknown dosha must fail");
  });
});

// ---------------------------------------------------------------------------
// 3. Decision — valid payloads
// ---------------------------------------------------------------------------

describe("Decision — valid payloads", () => {
  const schema = loadSchema("decision.schema.json");
  let validate;

  test("setup: schema compiles", () => {
    validate = makeAjv().compile(schema);
  });

  test("minimal decision is valid", () => {
    const ok = validate(VALID_DECISION);
    assert.ok(ok, JSON.stringify(validate.errors));
  });

  test("decision with food items and removed items is valid", () => {
    const ok = validate(VALID_DECISION_WITH_FOOD);
    assert.ok(ok, JSON.stringify(validate.errors));
  });

  test("all state values are accepted", () => {
    for (const state of ["calm", "intervention", "insufficient_baseline"]) {
      const ok = validate({ ...VALID_DECISION, state });
      assert.ok(ok, `state=${state} should be valid`);
    }
  });

  test("layer values 1-5 are all accepted (enum fix regression)", () => {
    for (const layer of [1, 2, 3, 4, 5]) {
      const ok = validate({
        ...VALID_DECISION,
        fired_rules: [{ rule_id: "test", layer, priority: 1 }],
      });
      assert.ok(ok, `layer=${layer} should be valid`);
    }
  });

  test("layer 6 is rejected (enum fix regression)", () => {
    const ok = validate({
      ...VALID_DECISION,
      fired_rules: [{ rule_id: "test", layer: 6, priority: 1 }],
    });
    assert.equal(ok, false, "layer=6 must fail");
  });

  test("layer 0 is rejected", () => {
    const ok = validate({
      ...VALID_DECISION,
      fired_rules: [{ rule_id: "test", layer: 0, priority: 1 }],
    });
    assert.equal(ok, false, "layer=0 must fail");
  });

  test("missing required 'state' is rejected", () => {
    const { state: _, ...bad } = VALID_DECISION;
    const ok = validate(bad);
    assert.equal(ok, false, "missing state must fail");
  });

  test("invalid activity verdict is rejected", () => {
    const ok = validate({
      ...VALID_DECISION,
      activity: { verdict: "skip" },
    });
    assert.equal(ok, false, "unknown verdict must fail");
  });

  test("removed item without rule_id is rejected", () => {
    const ok = validate({
      ...VALID_DECISION,
      food: {
        meals: [{
          slot: "dinner",
          items: [],
          removed: [{ name: "Salad", reason: "cold" }], // missing rule_id
        }],
      },
    });
    assert.equal(ok, false, "removedItem without rule_id must fail");
  });
});

// ---------------------------------------------------------------------------
// 4. DecisionEnvelope — valid payloads
// ---------------------------------------------------------------------------

describe("DecisionEnvelope — valid payloads", () => {
  const snapshotSchema = loadSchema("signal-snapshot.schema.json");
  const decisionSchema = loadSchema("decision.schema.json");
  const envelopeSchema = loadSchema("decision-envelope.schema.json");
  let validate;

  test("setup: schema compiles with cross-refs resolved locally", () => {
    const ajv = makeAjv();
    ajv.addSchema(snapshotSchema, "https://schema.weyos.app/v1/signal-snapshot.json");
    ajv.addSchema(decisionSchema, "https://schema.weyos.app/v1/decision.json");
    validate = ajv.compile(envelopeSchema);
  });

  test("valid envelope is accepted", () => {
    const ok = validate(VALID_ENVELOPE);
    assert.ok(ok, JSON.stringify(validate.errors));
  });

  test("decision_id with wrong format is rejected", () => {
    const ok = validate({ ...VALID_ENVELOPE, decision_id: "short" });
    assert.equal(ok, false, "decision_id not matching pattern must fail");
  });

  test("missing presentation.fired_layers is rejected", () => {
    const { fired_layers: _, ...badPresentation } = VALID_ENVELOPE.presentation;
    const ok = validate({ ...VALID_ENVELOPE, presentation: badPresentation });
    assert.equal(ok, false, "missing fired_layers must fail");
  });

  test("unknown warning_kind is rejected", () => {
    const ok = validate({
      ...VALID_ENVELOPE,
      presentation: {
        ...VALID_ENVELOPE.presentation,
        warning_kinds: ["unknown_future_kind"],
      },
    });
    assert.equal(ok, false, "unknown warning_kind must fail");
  });
});
