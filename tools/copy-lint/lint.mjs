// Copy lint: banned vocabulary and banned tone in user-facing copy (SCRUM-123).
//
// Pure functions only. check.mjs does the file walking and exit codes, and lint.test.mjs tests
// this module with no filesystem.
//
// "User-facing copy" means text a person can read in the app:
//   * string literals, template-literal text and JSX text in apps/mobile, parsed with the
//     TypeScript compiler so comments are never scanned and code tokens can be told apart
//     from prose; and
//   * the rulebook fields that reach the screen: rule `name` (Trace), `message`, activity
//     `suggestions` / `downgrade_to` (the prescribed activity), and `add_items[].name`.
//
// A string counts as a CODE TOKEN, not copy, when it is a module specifier, a string-literal
// type, a `case` label, one side of an equality or `in` test, a property name or element-access
// key, a directive, or the value of a JSX attribute that is never shown (testID, role, ...). So
// `activity.prescribed`, `activity["prescribed"]` and `case "streak":` are all fine, while
// `<Text>Prescribed for you</Text>` is not.

import ts from "typescript";
import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

/** JSX attributes whose values are never rendered as text. Everything else is copy. */
export const NON_COPY_JSX_ATTRIBUTES = new Set([
  "key", "testID", "nativeID", "accessibilityRole", "role", "pointerEvents", "resizeMode",
  "keyboardType", "autoCapitalize", "autoComplete", "textContentType", "returnKeyType",
  "importantForAccessibility", "accessibilityLiveRegion", "ellipsizeMode", "href", "id",
]);

const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword,
]);

/** Build `form -> {head, kind}` from terms.json. Throws on a form listed twice. */
export function indexTerms(terms) {
  const index = new Map();
  for (const kind of Object.keys(terms).filter((k) => !k.startsWith("$"))) {
    for (const [head, forms] of Object.entries(terms[kind] ?? {})) {
      for (const form of forms) {
        const key = form.toLowerCase();
        if (index.has(key)) throw new Error(`terms.json lists "${form}" twice`);
        index.set(key, { head, kind });
      }
    }
  }
  return index;
}

/** Banned words in a piece of text: whole words, case-insensitive. */
export function findTerms(text, index) {
  const hits = [];
  for (const raw of text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) ?? []) {
    const form = raw.replace(/’/g, "'").toLowerCase();
    const term = index.get(form);
    if (term !== undefined) hits.push({ word: raw, ...term });
  }
  return hits;
}

function isCodeToken(node) {
  const p = node.parent;
  if (p === undefined) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isCallExpression(p) &&
      (p.expression.kind === ts.SyntaxKind.ImportKeyword ||
       (ts.isIdentifier(p.expression) && p.expression.text === "require"))) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isCaseClause(p) && p.expression === node) return true;
  if (ts.isBinaryExpression(p) && EQUALITY.has(p.operatorToken.kind)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) ||
       ts.isMethodDeclaration(p) || ts.isEnumMember(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isComputedPropertyName(p)) return true;
  if (ts.isExpressionStatement(p) && ts.isSourceFile(p.parent)) return true; // "use strict"
  if (ts.isJsxAttribute(p) && NON_COPY_JSX_ATTRIBUTES.has(p.name.getText())) return true;
  return false;
}

/** Every piece of user-visible text in a TS/TSX source file, with its position. */
export function extractFromTs(fileName, source) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const at = (node) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { line: line + 1, col: character + 1 };
  };

  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isCodeToken(node)) out.push({ ...at(node), text: node.text });
    } else if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      out.push({ ...at(node), text: parts.join(" … ") });
    } else if (ts.isJsxText(node)) {
      if (!node.containsOnlyTriviaWhiteSpaces) out.push({ ...at(node), text: node.text.trim() });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** The rulebook fields a user can read. Disabled rules are included: enabling one ships it. */
export function extractFromRulebook(source) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter });
  const out = [];
  const push = (node, where) => {
    if (!isScalar(node) || typeof node.value !== "string") return;
    const { line, col } = lineCounter.linePos(node.range[0]);
    out.push({ line, col, text: node.value, where });
  };
  const seq = (node) => (isSeq(node) ? node.items : []);

  for (const rule of seq(doc.get("rules", true))) {
    if (!isMap(rule)) continue;
    const id = String(rule.get("id") ?? "?");
    push(rule.get("name", true), `rule ${id} name`);
    const effects = rule.get("effects", true);
    if (!isMap(effects)) continue;
    push(effects.get("message", true), `rule ${id} message`);
    const activity = effects.get("activity", true);
    if (isMap(activity)) {
      for (const field of ["suggestions", "downgrade_to"]) {
        for (const item of seq(activity.get(field, true))) push(item, `rule ${id} activity.${field}`);
      }
    }
    const food = effects.get("food", true);
    if (isMap(food)) {
      for (const item of seq(food.get("add_items", true))) {
        if (isMap(item)) push(item.get("name", true), `rule ${id} food.add_items name`);
      }
    }
  }
  return out;
}

/**
 * Apply the terms and the exception list to extracted text.
 *
 * Returns violations plus the set of exception indexes that matched, so the caller can report
 * exceptions that no longer match anything.
 */
export function lintEntries(file, entries, index, exceptions) {
  const violations = [];
  const used = new Set();
  for (const entry of entries) {
    const hits = findTerms(entry.text, index);
    if (hits.length === 0) continue;
    const allowed = new Set();
    exceptions.forEach((ex, i) => {
      if (ex.file === file && ex.text === entry.text) {
        used.add(i);
        for (const t of ex.terms) allowed.add(t);
      }
    });
    for (const hit of hits) {
      if (allowed.has(hit.head)) continue;
      violations.push({ file, line: entry.line, col: entry.col, ...hit, text: entry.text, where: entry.where });
    }
  }
  return { violations, used };
}

export function formatViolation(v) {
  const where = v.where ? ` (${v.where})` : "";
  const text = v.text.length > 90 ? `${v.text.slice(0, 87)}...` : v.text;
  return `${v.file}:${v.line}:${v.col}  "${v.word}" is banned ${v.kind} (${v.head})${where}\n    ${JSON.stringify(text)}`;
}
