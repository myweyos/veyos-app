# tools/jira — Weyos Jira from the repo

Read and update the Weyos Jira (`weyos.atlassian.net`) from a terminal or an agent session.

```bash
cp .env.example .env              # once; fill in the three JIRA_ values, never commit it
node tools/jira/whoami.mjs        # prove the token works and see what it reaches — read-only
node tools/jira/sprint.mjs        # every issue in the active sprint(s) — read-only
node tools/jira/move.mjs SCRUM-79 "In Progress"
node tools/jira/move.mjs SCRUM-79 "In Review" --comment-file note.txt
```

## Why this exists instead of the Atlassian connector

The claude.ai Atlassian connector in use on this machine is authorised against a **different
company's** site. Weyos must not share a credential path with it, so this tooling reads its own
token from `.env` and talks only to the Weyos site.

## The token

Create it at <https://id.atlassian.com/manage-profile/security/api-tokens> **while signed in as the
Weyos account** (`info@weyos.ai`). A Jira API token authenticates as the whole user across every
site that account can reach — it is not scoped to a project — so the account it comes from is the
only thing keeping the separation real.

`whoami.mjs` is the check for that: it prints who the token belongs to and which projects it can
see. If it shows anything other than Weyos, stop.

Atlassian shows a token exactly once. A paste that drops a single character produces a token that
looks perfect — right prefix, no whitespace — and fails with 401 at every endpoint, including
`api.atlassian.com/me`. That happened while setting this up; a fresh token fixed it.

## Handling of the secret

- Nothing here prints, logs or echoes the token. It goes from the environment straight into an
  `Authorization` header.
- `redact()` strips the token, the email and any `Basic` header from error text before it reaches
  a terminal or a CI log. Jira echoes parts of the request in some error responses.
- `.env` is gitignored. `.env.example` is committed and carries no secret.

## Behaviour worth knowing

- **Statuses are matched by name**, not transition id. Ids differ between workflows; a renamed
  column fails loudly with the list of what was available rather than moving a ticket somewhere
  unexpected.
- **Comments come from a file.** Multi-line text on a command line gets mangled by shells, and
  Windows PowerShell 5.1 strips embedded quotes from native-command arguments.
- **The comment is posted before the transition**, so a ticket never lands in a new column without
  the note that explains why.

## Tests

```bash
node --test tools/jira/adf.test.mjs
```

Covers the Atlassian Document Format conversion and redaction. No network, no credentials.
