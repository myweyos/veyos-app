/**
 * Tests for the pure parts of the Jira tooling. No network, no credentials.
 *
 *     node --test tools/jira/adf.test.mjs
 *
 * Name the file explicitly: passing the directory makes newer Node versions try to execute
 * every .mjs in it, including the CLIs, which need credentials.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { redact, toAdf } from "./client.mjs";

test("paragraphs split on blank lines", () => {
  const doc = toAdf("first\n\nsecond");
  assert.equal(doc.type, "doc");
  assert.equal(doc.content.length, 2);
  assert.equal(doc.content[1].content[0].text, "second");
});

test("single newlines become hard breaks, not new paragraphs", () => {
  const doc = toAdf("line one\nline two");
  assert.equal(doc.content.length, 1);
  assert.deepEqual(
    doc.content[0].content.map((n) => n.type),
    ["text", "hardBreak", "text"],
  );
});

test("bare URLs become link marks", () => {
  const doc = toAdf("PR: https://github.com/myweyos/veyos-app/pull/7 thanks");
  const nodes = doc.content[0].content;
  const link = nodes.find((n) => n.marks?.[0]?.type === "link");
  assert.equal(link.marks[0].attrs.href, "https://github.com/myweyos/veyos-app/pull/7");
  assert.equal(nodes.at(-1).text, " thanks");
});

test("redact removes the token, the email and any Basic header", () => {
  const cfg = { token: "ATATTsecretvalue", email: "someone@weyos.ai" };
  const out = redact(
    "auth failed for someone@weyos.ai using ATATTsecretvalue; header Basic c29tZTpzZWNyZXQ=",
    cfg,
  );
  assert.ok(!out.includes("ATATTsecretvalue"));
  assert.ok(!out.includes("someone@weyos.ai"));
  assert.ok(!out.includes("c29tZTpzZWNyZXQ="));
});
