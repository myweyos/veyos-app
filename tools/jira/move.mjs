/**
 * Move a Weyos Jira issue to a status, optionally leaving a comment.
 *
 *     node tools/jira/move.mjs SCRUM-79 "In Progress"
 *     node tools/jira/move.mjs SCRUM-79 "In Review" --comment-file pr-note.txt
 *     node tools/jira/move.mjs SCRUM-79 --comment-file note.txt        # comment only
 *
 * The status is matched by name against the transitions Jira offers for that issue, so a
 * renamed column or a different workflow fails loudly rather than moving the ticket somewhere
 * unexpected.
 *
 * Comments come from a file rather than an argument: multi-line text passed on a command line
 * gets mangled by shells, and Windows PowerShell 5.1 strips embedded quotes from native args.
 *
 * The comment is posted BEFORE the transition, so a ticket never lands in a new column without
 * the note explaining why.
 */

import { readFileSync } from "node:fs";

import { JiraClient, config, redact } from "./client.mjs";

function parse(argv) {
  const args = { key: undefined, status: undefined, commentFile: undefined };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--comment-file") args.commentFile = argv[++i];
    else rest.push(argv[i]);
  }
  [args.key, args.status] = rest;
  return args;
}

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.key === undefined || !/^[A-Z][A-Z0-9]+-\d+$/.test(args.key)) {
    console.error('usage: node tools/jira/move.mjs <KEY> ["<Status>"] [--comment-file <path>]');
    process.exitCode = 2;
    return;
  }
  if (args.status === undefined && args.commentFile === undefined) {
    console.error("nothing to do: give a status, a --comment-file, or both");
    process.exitCode = 2;
    return;
  }

  const cfg = config();
  const jira = new JiraClient(cfg);
  try {
    if (args.commentFile !== undefined) {
      const text = readFileSync(args.commentFile, "utf-8");
      await jira.comment(args.key, text);
      console.log(`${args.key}: comment added (${text.trim().split("\n").length} lines)`);
    }
    if (args.status !== undefined) {
      const landed = await jira.moveTo(args.key, args.status);
      console.log(`${args.key}: -> ${landed}`);
    }
  } catch (error) {
    console.error(redact(String(error.message), cfg));
    process.exitCode = 1;
  }
}

main();
