/**
 * List what is in the active sprint(s). Read-only.
 *
 *     node tools/jira/sprint.mjs
 *
 * Walks boards -> active sprints -> issues, because "active sprint" is a board concept and
 * only the Agile API knows about it. Falls back to a JQL openSprints() query if the account
 * cannot see boards, which happens when the token has Jira access but not the Software
 * product.
 */

import { JiraClient, config } from "./client.mjs";

const STATUS_WIDTH = 14;

function line(issue) {
  const f = issue.fields;
  const status = (f.status?.name ?? "?").slice(0, STATUS_WIDTH).padEnd(STATUS_WIDTH);
  const type = (f.issuetype?.name ?? "?").slice(0, 7).padEnd(7);
  const who = f.assignee?.displayName ?? "unassigned";
  return `  ${issue.key.padEnd(10)} ${status} ${type} ${f.summary}\n${" ".repeat(13)}${who}`;
}

async function main() {
  const jira = new JiraClient(config());
  const projects = await jira.projects();
  const keys = projects.values.map((p) => p.key);
  console.log(`projects: ${keys.join(", ")}\n`);

  let boards;
  try {
    boards = await jira.agile("GET", "/board?maxResults=50");
  } catch (error) {
    console.log(`could not list boards (${String(error.message).split("\n")[0]})`);
    boards = { values: [] };
  }

  let found = 0;
  for (const board of boards.values ?? []) {
    let sprints;
    try {
      sprints = await jira.agile("GET", `/board/${board.id}/sprint?state=active`);
    } catch {
      continue; // Kanban boards have no sprints; skip rather than fail the run.
    }
    for (const sprint of sprints.values ?? []) {
      found++;
      console.log(`── ${sprint.name}  (board: ${board.name}, sprint id ${sprint.id})`);
      if (sprint.startDate) {
        console.log(`   ${sprint.startDate.slice(0, 10)} → ${sprint.endDate?.slice(0, 10) ?? "?"}`);
      }
      if (sprint.goal) console.log(`   goal: ${sprint.goal}`);
      const issues = await jira.agile(
        "GET",
        `/sprint/${sprint.id}/issue?maxResults=100&fields=summary,status,issuetype,assignee,labels`,
      );
      const list = issues.issues ?? [];
      console.log(`   ${list.length} issue${list.length === 1 ? "" : "s"}\n`);
      for (const issue of list) console.log(line(issue));
      console.log("");
    }
  }

  if (found === 0) {
    console.log("No active sprints found via the Agile API. Trying JQL openSprints()…\n");
    for (const key of keys) {
      try {
        const r = await jira.search(
          `project = ${key} AND sprint IN openSprints() ORDER BY status`,
          ["summary", "status", "issuetype", "assignee", "labels"],
          100,
        );
        const list = r.issues ?? [];
        console.log(`${key}: ${list.length} issue(s) in open sprints`);
        for (const issue of list) console.log(line(issue));
      } catch (error) {
        console.log(`${key}: ${String(error.message).split("\n")[0]}`);
      }
    }
  }

  console.log("\nRead-only. Nothing was created, edited or transitioned.");
}

main().catch((error) => {
  console.error(String(error.message));
  process.exitCode = 1;
});
