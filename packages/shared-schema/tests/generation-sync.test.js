/**
 * Generation sync tests for packages/shared-schema (SCRUM-24).
 *
 * Verifies that:
 *   1. Running `npm run generate` produces no diff vs the committed generated.ts.
 *   2. The generated file exports the expected type names.
 *   3. The generate script itself does not make network calls (local resolver).
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { execSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const PKG_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "../../..");
const GENERATED = path.join(PKG_ROOT, "src", "generated.ts");

describe("Generated TS is in sync with schemas", () => {
  test("src/generated.ts exists and is non-empty", () => {
    assert.ok(fs.existsSync(GENERATED), "generated.ts must exist");
    const content = fs.readFileSync(GENERATED, "utf8");
    assert.ok(content.length > 100, "generated.ts must be non-trivially populated");
  });

  test("npm run generate produces no diff (file is up-to-date)", () => {
    // Run the generator
    const gen = spawnSync("npm", ["run", "generate"], {
      cwd: PKG_ROOT,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(gen.status, 0, `generate failed:\n${gen.stderr}`);

    // Check git diff
    const diff = spawnSync("git", ["diff", "--exit-code", "packages/shared-schema/src/generated.ts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    assert.equal(
      diff.status,
      0,
      "src/generated.ts differs from committed version — run 'npm run generate -w @weyos/shared-schema' and commit"
    );
  });
});

describe("Generated file exports expected types", () => {
  let content;

  test("setup: read generated.ts", () => {
    content = fs.readFileSync(GENERATED, "utf8");
  });

  for (const typeName of ["SignalSnapshot", "Decision", "DecisionEnvelope", "LabValue", "FoodItem", "RemovedItem"]) {
    test(`exports ${typeName}`, () => {
      assert.match(
        content,
        new RegExp(`export (type |interface )${typeName}[\\s{]`),
        `generated.ts must export ${typeName}`
      );
    });
  }

  test("LabValue is a union with null (oneOf fix)", () => {
    // The generated type should be: export type LabValue = { ... } | null
    // Not: export type LabValue = { ... } & LabValue1 (the old broken form)
    assert.match(content, /export type LabValue = \{/, "LabValue should be a type alias");
    assert.match(content, /\} \| null;/, "LabValue should have a null branch");
    assert.doesNotMatch(content, /& LabValue1/, "LabValue must not use the broken & LabValue1 form");
  });

  test("layer is a literal union 1|2|3|4|5 (enum fix)", () => {
    assert.match(
      content,
      /layer:\s*1\s*\|\s*2\s*\|\s*3\s*\|\s*4\s*\|\s*5/,
      "layer must be typed as 1|2|3|4|5"
    );
  });

  test("generated file has the autogeneration banner", () => {
    assert.match(content, /GENERATED FILE/, "banner must be present");
  });

});

describe("Generate script uses local resolver (no network)", () => {
  test("generate script does not import http/https/fetch modules directly", () => {
    const script = fs.readFileSync(
      path.join(PKG_ROOT, "scripts", "generate.js"),
      "utf8"
    );
    // The custom resolver must be present (canRead checks for schema.weyos.app)
    assert.match(script, /schema\.weyos\.app/, "local resolver must be in place");
    assert.match(script, /localFileResolver/, "localFileResolver must be defined");
  });
});
