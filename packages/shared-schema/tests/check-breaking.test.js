/**
 * Unit tests for the check-breaking.js CI gate (SCRUM-24).
 *
 * Tests the pure detection functions exported by scripts/check-breaking.js:
 *   - detectBreaking: identifies breaking changes between two schema versions
 *   - collectProps, collectRequired, collectConsts, collectEnums: helpers
 *
 * The git-touching main() function is NOT tested here (requires a real repo
 * with origin/main). Integration is validated by the CI workflow itself.
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { detectBreaking, collectProps, collectRequired, collectConsts, collectEnums } =
  require(path.resolve(__dirname, "../scripts/check-breaking.js"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function schema(props = {}, required = [], defs = {}) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: props,
    required,
    $defs: defs,
  };
}

// ---------------------------------------------------------------------------
// detectBreaking — no change
// ---------------------------------------------------------------------------

describe("detectBreaking — identical schemas", () => {
  test("returns no issues when schemas are identical", () => {
    const s = schema({ name: { type: "string" } }, ["name"]);
    assert.deepEqual(detectBreaking(s, s, "test.json"), []);
  });

  test("returns no issues for empty schemas", () => {
    assert.deepEqual(detectBreaking({}, {}, "test.json"), []);
  });
});

// ---------------------------------------------------------------------------
// detectBreaking — additive (non-breaking)
// ---------------------------------------------------------------------------

describe("detectBreaking — additive changes (should not break)", () => {
  test("adding an optional property is NOT breaking", () => {
    const base = schema({ name: { type: "string" } }, ["name"]);
    const head = schema({ name: { type: "string" }, age: { type: "number" } }, ["name"]);
    assert.deepEqual(detectBreaking(base, head, "test.json"), []);
  });

  test("relaxing required (removing a required field) is NOT breaking", () => {
    const base = schema({ name: { type: "string" } }, ["name"]);
    const head = schema({ name: { type: "string" } }, []);
    assert.deepEqual(detectBreaking(base, head, "test.json"), []);
  });

  test("adding a new enum value is NOT breaking", () => {
    const base = schema({ color: { type: "string", enum: ["red", "blue"] } });
    const head = schema({ color: { type: "string", enum: ["red", "blue", "green"] } });
    assert.deepEqual(detectBreaking(base, head, "test.json"), []);
  });
});

// ---------------------------------------------------------------------------
// detectBreaking — breaking: removed property
// ---------------------------------------------------------------------------

describe("detectBreaking — removed property", () => {
  test("removing a top-level property is breaking", () => {
    const base = schema({ name: { type: "string" }, email: { type: "string" } });
    const head = schema({ name: { type: "string" } });
    const issues = detectBreaking(base, head, "test.json");
    assert.equal(issues.length, 1);
    assert.match(issues[0], /property removed: email/);
  });

  test("removing a nested property is breaking", () => {
    const base = schema({
      address: {
        type: "object",
        properties: { street: { type: "string" }, city: { type: "string" } },
      },
    });
    const head = schema({
      address: {
        type: "object",
        properties: { city: { type: "string" } },
      },
    });
    const issues = detectBreaking(base, head, "test.json");
    assert.equal(issues.length, 1);
    assert.match(issues[0], /property removed: address\.street/);
  });

  test("removing a property from $defs is breaking", () => {
    const base = { ...schema(), $defs: { lab: { type: "object", properties: { value: { type: "number" }, status: { type: "string" } } } } };
    const head = { ...schema(), $defs: { lab: { type: "object", properties: { status: { type: "string" } } } } };
    const issues = detectBreaking(base, head, "test.json");
    assert.equal(issues.length, 1);
    assert.match(issues[0], /property removed: value/);
  });
});

// ---------------------------------------------------------------------------
// detectBreaking — breaking: added to required
// ---------------------------------------------------------------------------

describe("detectBreaking — field added to required", () => {
  test("adding a field to required is breaking", () => {
    const base = schema({ name: { type: "string" }, age: { type: "number" } }, ["name"]);
    const head = schema({ name: { type: "string" }, age: { type: "number" } }, ["name", "age"]);
    const issues = detectBreaking(base, head, "test.json");
    assert.equal(issues.length, 1);
    assert.match(issues[0], /field added to required.*age/);
  });

  test("multiple fields added to required generates multiple issues", () => {
    const base = schema({ a: {}, b: {}, c: {} }, []);
    const head = schema({ a: {}, b: {}, c: {} }, ["a", "b", "c"]);
    const issues = detectBreaking(base, head, "test.json");
    assert.equal(issues.length, 3);
  });
});

// ---------------------------------------------------------------------------
// detectBreaking — breaking: const changed
// ---------------------------------------------------------------------------

describe("detectBreaking — const value changed", () => {
  test("changing a const value is breaking", () => {
    const base = schema({ schema_version: { const: 1 } });
    const head = schema({ schema_version: { const: 2 } });
    const issues = detectBreaking(base, head, "test.json");
    assert.equal(issues.length, 1);
    assert.match(issues[0], /const changed.*schema_version/);
  });

  test("adding a new const (no prior) is NOT breaking", () => {
    const base = schema({ name: { type: "string" } });
    const head = schema({ name: { const: "fixed" } });
    // The base had no const at 'name', so this isn't a const change from base perspective
    const issues = detectBreaking(base, head, "test.json");
    assert.equal(issues.length, 0);
  });
});

// ---------------------------------------------------------------------------
// detectBreaking — breaking: enum value removed
// ---------------------------------------------------------------------------

describe("detectBreaking — enum value removed", () => {
  test("removing an enum value is breaking", () => {
    const base = schema({ status: { type: "string", enum: ["a", "b", "c"] } });
    const head = schema({ status: { type: "string", enum: ["a", "c"] } });
    const issues = detectBreaking(base, head, "test.json");
    assert.equal(issues.length, 1);
    assert.match(issues[0], /enum value removed.*status.*b/);
  });

  test("replacing enum with open type is NOT breaking (additive — more values accepted)", () => {
    // Removing the enum constraint allows MORE values, so previously valid data still works.
    const base = schema({ color: { enum: ["red", "blue"] } });
    const head = schema({ color: { type: "string" } });
    const issues = detectBreaking(base, head, "test.json");
    assert.deepEqual(issues, [], "dropping an enum constraint is additive, not breaking");
  });
});

// ---------------------------------------------------------------------------
// detectBreaking — multiple issues at once
// ---------------------------------------------------------------------------

describe("detectBreaking — multiple breaking changes", () => {
  test("reports all breaking issues in one call", () => {
    const base = schema(
      { name: { type: "string" }, role: { type: "string", enum: ["admin", "user"] } },
      []
    );
    const head = schema(
      { role: { type: "string", enum: ["admin"] } }, // name removed, user enum removed, name added to implicit-required
      ["role"]
    );
    const issues = detectBreaking(base, head, "test.json");
    // Should find: 'name' property removed, 'user' enum removed, 'role' added to required
    assert.ok(issues.length >= 3, `expected ≥3 issues, got ${issues.length}: ${issues.join("; ")}`);
  });
});

// ---------------------------------------------------------------------------
// collectProps helper
// ---------------------------------------------------------------------------

describe("collectProps", () => {
  test("collects top-level property names", () => {
    const s = schema({ a: {}, b: {}, c: {} });
    const props = collectProps(s);
    assert.ok(props.has("a"));
    assert.ok(props.has("b"));
    assert.ok(props.has("c"));
  });

  test("collects nested property paths", () => {
    const s = schema({ parent: { type: "object", properties: { child: {} } } });
    const props = collectProps(s);
    assert.ok(props.has("parent"));
    assert.ok(props.has("parent.child"));
  });

  test("empty schema returns empty set", () => {
    assert.equal(collectProps({}).size, 0);
  });
});

// ---------------------------------------------------------------------------
// Regression: our actual schema changes from SCRUM-24
// ---------------------------------------------------------------------------

describe("Regression — SCRUM-24 schema changes vs conceptual base", () => {
  test("adding $defs/foodItem and $defs/removedItem is detected as breaking (tightened required)", () => {
    // Base: meals items were bare { type: "object" } — no required
    const base = {
      type: "object",
      properties: {
        food: {
          type: "object",
          properties: {
            meals: {
              type: "array",
              items: {
                type: "object",
                required: ["slot", "items", "removed"],
                properties: {
                  slot: { type: "string" },
                  items: { type: "array", items: { type: "object" } },
                  removed: { type: "array", items: { type: "object" } },
                },
              },
            },
          },
        },
      },
    };

    // Head: removed items now require name, rule_id, reason
    const head = {
      type: "object",
      properties: {
        food: {
          type: "object",
          properties: {
            meals: {
              type: "array",
              items: {
                type: "object",
                required: ["slot", "items", "removed"],
                properties: {
                  slot: { type: "string" },
                  items: { type: "array", items: { type: "object" } },
                  removed: { type: "array", items: { $ref: "#/$defs/removedItem" } },
                },
              },
            },
          },
        },
      },
      $defs: {
        removedItem: {
          type: "object",
          required: ["name", "rule_id", "reason"],
          properties: {
            name: { type: "string" },
            rule_id: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
    };

    const issues = detectBreaking(base, head, "decision.schema.json");
    // The new required fields inside $defs are detected
    assert.ok(
      issues.some((i) => i.includes("name") || i.includes("rule_id") || i.includes("reason")),
      `expected required-field issues; got: ${issues.join("; ")}`
    );
  });

});
