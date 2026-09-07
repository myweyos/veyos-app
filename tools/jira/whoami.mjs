/**
 * Prove the credential works, and show what it can reach. Read-only.
 *
 *     node tools/jira/whoami.mjs
 *
 * Run this first. It writes nothing, and it is the check that catches the failure that
 * matters most here: a token created from the wrong Atlassian account. Weyos and the org
 * behind the claude.ai connector are different companies, and a token from the wrong one
 * would appear to work while pointing at an unrelated site.
 */

import { JiraClient, config, redact } from "./client.mjs";

async function main() {
  let cfg;
  try {
    cfg = config();
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const jira = new JiraClient(cfg);
  console.log(`site   ${cfg.baseUrl}`);

  try {
    const me = await jira.myself();
    console.log(`token  valid — ${me.displayName} <${me.emailAddress ?? "email hidden"}>`);
    console.log(`account ${me.accountId}`);
  } catch (error) {
    console.error(`✗ token rejected\n${redact(String(error.message), cfg)}`);
    process.exitCode = 1;
    return;
  }

  const projects = await jira.projects();
  console.log(`\nprojects visible: ${projects.total ?? projects.values.length}`);
  for (const p of projects.values) {
    console.log(`  ${p.key.padEnd(8)} ${p.name}`);
  }

  if (projects.values.length === 0) {
    console.log("\n  No projects. Either the token is from the wrong account, or it has no");
    console.log("  Jira access on this site.");
    return;
  }

  const key = cfg.projectKey || projects.values[0].key;
  const issues = await jira.search(`project = ${key} ORDER BY created DESC`, ["summary"], 1);
  console.log(`\n${key}: ${issues.total ?? "?"} issues`);
  console.log("\nRead-only. Nothing was created, edited or transitioned.");
}

main().catch((error) => {
  console.error(String(error.message));
  process.exitCode = 1;
});
