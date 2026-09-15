#!/usr/bin/env node
// Copy lint CLI. Exit 0 = clean, 1 = banned copy or a stale exception.
//
//   node tools/copy-lint/check.mjs
//
// What is scanned, and why, is in README.md next to this file.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractFromRulebook, extractFromTs, formatViolation, indexTerms, lintEntries,
} from "./lint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Overridable only so lint.test.mjs can prove the CLI exits 1 on a throwaway tree.
const ROOT = process.env.COPY_LINT_ROOT ?? join(HERE, "..", "..");

// Where user-facing copy lives. Add a surface here when it starts rendering text.
const TS_ROOTS = ["apps/mobile"];
const RULEBOOK_DIR = "config/rules";
const SKIP_DIRS = new Set(["node_modules", ".expo", "dist", "build", "android", "ios", "coverage"]);
const IS_TEST = /\.(test|spec)\.tsx?$|\.d\.ts$/;

const readJson = (p) => JSON.parse(readFileSync(join(HERE, p), "utf8"));
const posix = (p) => relative(ROOT, p).split(sep).join("/");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const index = indexTerms(readJson("terms.json"));
const exceptions = readJson("exceptions.json").exceptions;
const violations = [];
const used = new Set();
let files = 0;

const record = (file, entries) => {
  files += 1;
  const result = lintEntries(file, entries, index, exceptions);
  violations.push(...result.violations);
  for (const i of result.used) used.add(i);
};

for (const root of TS_ROOTS) {
  for (const path of walk(join(ROOT, root))) {
    if (!/\.tsx?$/.test(path) || IS_TEST.test(path)) continue;
    record(posix(path), extractFromTs(path, readFileSync(path, "utf8")));
  }
}
for (const name of readdirSync(join(ROOT, RULEBOOK_DIR))) {
  if (!/\.ya?ml$/.test(name)) continue;
  const path = join(ROOT, RULEBOOK_DIR, name);
  record(posix(path), extractFromRulebook(readFileSync(path, "utf8")));
}

const stale = exceptions.filter((_, i) => !used.has(i));

if (violations.length > 0) {
  console.error("Banned copy (SCRUM-123). Reword it; if the use is legitimate, add a reviewed");
  console.error("entry to tools/copy-lint/exceptions.json.\n");
  for (const v of violations) console.error(formatViolation(v));
}
if (stale.length > 0) {
  console.error("\nExceptions that no longer match any copy. Remove them:");
  for (const ex of stale) console.error(`  ${ex.file}: ${JSON.stringify(ex.text)}`);
}
if (violations.length > 0 || stale.length > 0) process.exit(1);

console.log(`Copy lint OK: ${files} files, ${exceptions.length} reviewed exception(s).`);
