#!/usr/bin/env node
/**
 * CI gate: detects breaking changes in JSON Schemas vs origin/main and
 * requires an explicit version bump in package.json.
 *
 * Breaking change = any of:
 *   - A property removed from an object's `properties`
 *   - A property added to `required`
 *   - A `const` value changed
 *   - An enum item removed
 *
 * Additive changes (new optional property, relaxed constraint) are allowed
 * without a bump. The caller passes --require-bump-on-any to treat ALL
 * schema changes as requiring a bump.
 *
 * Usage:
 *   node scripts/check-breaking.js [--require-bump-on-any]
 *
 * Exits 0 if safe, 1 if breaking change detected without a version bump.
 * Exits 0 with a notice if schemas are unchanged or we cannot reach origin/main
 * (e.g. local run without a remote).
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const PKG_PATH = path.resolve(__dirname, "../package.json");
const SCHEMAS = [
  "signal-snapshot.schema.json",
  "decision.schema.json",
  "decision-envelope.schema.json",
];
const SCHEMA_DIR_REL = "packages/shared-schema/schemas";
const PKG_REL = "packages/shared-schema/package.json";
const REQUIRE_ANY = process.argv.includes("--require-bump-on-any");

function git(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getBaseVersion() {
  const raw = git(`git show origin/main:${PKG_REL}`);
  if (!raw) return null;
  return JSON.parse(raw).version;
}

function getBaseSchema(file) {
  const raw = git(`git show origin/main:${SCHEMA_DIR_REL}/${file}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Collect all nested property keys at any depth. */
function collectProps(schema, path = "", acc = new Set()) {
  if (!schema || typeof schema !== "object") return acc;
  if (schema.properties) {
    for (const [k, v] of Object.entries(schema.properties)) {
      const full = path ? `${path}.${k}` : k;
      acc.add(full);
      collectProps(v, full, acc);
    }
  }
  for (const key of ["items", "additionalItems", "then", "else"]) {
    if (schema[key]) collectProps(schema[key], path, acc);
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(schema[key])) {
      schema[key].forEach((s) => collectProps(s, path, acc));
    }
  }
  for (const def of Object.values(schema.$defs ?? {})) {
    collectProps(def, path, acc);
  }
  return acc;
}

/** Collect all `required` entries (nested), keyed by parent path. */
function collectRequired(schema, path = "", acc = new Map()) {
  if (!schema || typeof schema !== "object") return acc;
  if (Array.isArray(schema.required)) {
    const key = path || "(root)";
    acc.set(key, new Set(schema.required));
  }
  if (schema.properties) {
    for (const [k, v] of Object.entries(schema.properties)) {
      collectRequired(v, path ? `${path}.${k}` : k, acc);
    }
  }
  for (const key of ["items", "additionalItems", "then", "else"]) {
    if (schema[key]) collectRequired(schema[key], path, acc);
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(schema[key])) {
      schema[key].forEach((s) => collectRequired(s, path, acc));
    }
  }
  for (const def of Object.values(schema.$defs ?? {})) {
    collectRequired(def, path, acc);
  }
  return acc;
}

/** Collect all `const` values at property paths. */
function collectConsts(schema, path = "", acc = new Map()) {
  if (!schema || typeof schema !== "object") return acc;
  if ("const" in schema) acc.set(path || "(root)", schema.const);
  if (schema.properties) {
    for (const [k, v] of Object.entries(schema.properties)) {
      collectConsts(v, path ? `${path}.${k}` : k, acc);
    }
  }
  for (const key of ["items", "then", "else"]) {
    if (schema[key]) collectConsts(schema[key], path, acc);
  }
  for (const def of Object.values(schema.$defs ?? {})) {
    collectConsts(def, path, acc);
  }
  return acc;
}

/** Collect all `enum` arrays at property paths. */
function collectEnums(schema, path = "", acc = new Map()) {
  if (!schema || typeof schema !== "object") return acc;
  if (Array.isArray(schema.enum)) acc.set(path || "(root)", new Set(schema.enum));
  if (schema.properties) {
    for (const [k, v] of Object.entries(schema.properties)) {
      collectEnums(v, path ? `${path}.${k}` : k, acc);
    }
  }
  for (const key of ["items", "then", "else"]) {
    if (schema[key]) collectEnums(schema[key], path, acc);
  }
  for (const def of Object.values(schema.$defs ?? {})) {
    collectEnums(def, path, acc);
  }
  return acc;
}

function detectBreaking(base, head, file) {
  const issues = [];

  // Removed properties
  const baseProps = collectProps(base);
  const headProps = collectProps(head);
  for (const p of baseProps) {
    if (!headProps.has(p)) issues.push(`${file}: property removed: ${p}`);
  }

  // Properties added to required
  const baseReq = collectRequired(base);
  const headReq = collectRequired(head);
  for (const [scope, headSet] of headReq) {
    const baseSet = baseReq.get(scope) ?? new Set();
    for (const r of headSet) {
      if (!baseSet.has(r)) issues.push(`${file}: field added to required at ${scope}: ${r}`);
    }
  }

  // const values changed
  const baseConsts = collectConsts(base);
  const headConsts = collectConsts(head);
  for (const [path, val] of baseConsts) {
    if (headConsts.has(path) && headConsts.get(path) !== val) {
      issues.push(`${file}: const changed at ${path}: ${val} → ${headConsts.get(path)}`);
    }
  }

  // enum items removed
  const baseEnums = collectEnums(base);
  const headEnums = collectEnums(head);
  for (const [path, baseSet] of baseEnums) {
    const headSet = headEnums.get(path);
    if (!headSet) continue;
    for (const v of baseSet) {
      if (!headSet.has(v)) issues.push(`${file}: enum value removed at ${path}: ${v}`);
    }
  }

  return issues;
}

// Export detection functions for testing
if (typeof module !== "undefined") {
  module.exports = { detectBreaking, collectProps, collectRequired, collectConsts, collectEnums };
}

function main() {
  const baseVersion = getBaseVersion();
  if (!baseVersion) {
    console.log("check-breaking: could not reach origin/main — skipping.");
    process.exit(0);
  }

  const currentVersion = JSON.parse(fs.readFileSync(PKG_PATH, "utf8")).version;
  const versionBumped = currentVersion !== baseVersion;

  let anyChange = false;
  const breakingIssues = [];

  for (const file of SCHEMAS) {
    const base = getBaseSchema(file);
    const headPath = path.join(__dirname, "../schemas", file);
    if (!fs.existsSync(headPath)) {
      breakingIssues.push(`${file}: schema file deleted`);
      anyChange = true;
      continue;
    }
    const head = JSON.parse(fs.readFileSync(headPath, "utf8"));

    if (!base) {
      // New schema file — additive, not breaking
      anyChange = true;
      console.log(`check-breaking: new schema file: ${file}`);
      continue;
    }

    const baseStr = JSON.stringify(base, null, 2);
    const headStr = JSON.stringify(head, null, 2);
    if (baseStr === headStr) continue;

    anyChange = true;
    breakingIssues.push(...detectBreaking(base, head, file));
  }

  if (!anyChange) {
    console.log("check-breaking: no schema changes detected.");
    process.exit(0);
  }

  if (REQUIRE_ANY && !versionBumped) {
    console.error(
      `::error::Schema changed but version in packages/shared-schema/package.json ` +
        `is still ${currentVersion}. Bump it (patch/minor/major) and commit.`
    );
    process.exit(1);
  }

  if (breakingIssues.length > 0) {
    console.log("check-breaking: breaking changes detected:");
    breakingIssues.forEach((i) => console.log(`  • ${i}`));
    if (!versionBumped) {
      console.error(
        `::error::Breaking schema changes require a version bump in ` +
          `packages/shared-schema/package.json (currently ${currentVersion}). ` +
          `Bump the MAJOR version and add an ADR per CLAUDE.md.`
      );
      process.exit(1);
    }
    console.log(
      `check-breaking: version bumped ${baseVersion} → ${currentVersion}. OK.`
    );
  } else {
    console.log(
      `check-breaking: additive schema changes only. Version: ${currentVersion}.`
    );
    if (!versionBumped) {
      console.log(
        "  (tip: bump the MINOR version to signal the additive change)"
      );
    }
  }

  process.exit(0);
}

if (require.main === module) main();
