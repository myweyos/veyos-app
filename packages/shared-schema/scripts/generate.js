#!/usr/bin/env node
/**
 * Generates src/generated.ts from the three JSON Schemas in schemas/.
 *
 * Why a script instead of the json2ts CLI directly:
 *   decision-envelope.schema.json references decision.json via its $id URI
 *   (https://schema.weyos.app/v1/decision.json). The CLI resolves absolute
 *   URIs over the network; we intercept them with a local-file resolver so
 *   the generator never makes a network call.
 *
 *   We also process schemas in order with declareExternallyReferenced: false
 *   on the envelope so Decision is not emitted twice.
 */

const { compile } = require("json-schema-to-typescript");
const fs = require("fs");
const path = require("path");

const SCHEMAS_DIR = path.resolve(__dirname, "../schemas");
const OUT_FILE = path.resolve(__dirname, "../src/generated.ts");
const BANNER =
  "// GENERATED FILE — do not edit. Run npm run generate.\n" +
  "// Source: packages/shared-schema/schemas/*.schema.json\n\n";

const SCHEMAS = [
  {
    file: "signal-snapshot.schema.json",
    // unreachableDefinitions emits $defs (e.g. LabValue) that are only
    // referenced internally via $ref.
    opts: { unreachableDefinitions: true, declareExternallyReferenced: true },
  },
  {
    file: "decision.schema.json",
    opts: { unreachableDefinitions: false, declareExternallyReferenced: true },
  },
  {
    file: "decision-envelope.schema.json",
    // Decision is already emitted above; don't declare it again.
    opts: { unreachableDefinitions: false, declareExternallyReferenced: false },
  },
];

// Map schema $id URIs to local file paths so cross-schema $refs resolve
// without hitting the network.
const ID_TO_LOCAL = Object.fromEntries(
  SCHEMAS.map(({ file }) => {
    const schemaPath = path.join(SCHEMAS_DIR, file);
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    return [schema.$id, schemaPath];
  })
);

const localFileResolver = {
  order: 1,
  canRead: (file) => file.url.startsWith("https://schema.weyos.app/"),
  read(file) {
    const localPath = ID_TO_LOCAL[file.url];
    if (!localPath) throw new Error(`Unknown schema URI: ${file.url}`);
    return fs.readFileSync(localPath, "utf8");
  },
};

async function generate() {
  const parts = [];

  for (const { file, opts } of SCHEMAS) {
    const schemaPath = path.join(SCHEMAS_DIR, file);
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    const ts = await compile(schema, schema.title ?? file, {
      cwd: SCHEMAS_DIR,
      $refOptions: { resolve: { local: localFileResolver } },
      bannerComment: "",
      format: true,
      ...opts,
    });
    parts.push(`// --- ${file} ---\n${ts}`);
  }

  fs.writeFileSync(OUT_FILE, BANNER + parts.join("\n"), "utf8");
  console.log(`Generated ${OUT_FILE}`);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
