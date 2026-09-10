/**
 * Minimal Jira Cloud REST client.
 *
 * Deliberately separate from the claude.ai Atlassian connector, which is authorised against a
 * different company's site. Weyos and that org must not share a credential path, so this reads
 * its own token from .env and talks to its own site.
 *
 * THE TOKEN IS NEVER READ, PRINTED OR LOGGED BY ANYTHING HERE. It is passed straight from
 * process.env into an Authorization header. `redact()` exists because the easiest way to leak
 * a credential is an error message that helpfully includes the request.
 *
 * A Jira API token authenticates as the WHOLE USER across every site that account can reach —
 * it is not scoped to a project. That is why .env.example insists the token comes from the
 * Weyos account specifically.
 *
 * Node 20+. Zero dependencies: global fetch, and .env parsed by hand rather than pulling in
 * dotenv for six lines.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** Parse .env without a dependency. Values are not expanded or interpolated. */
export function loadEnv(path = join(REPO_ROOT, ".env")) {
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

export function config() {
  const env = { ...loadEnv(), ...process.env };
  const missing = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"].filter(
    (k) => (env[k] ?? "") === "",
  );
  if (missing.length > 0) {
    throw new Error(
      `missing ${missing.join(", ")}. Copy .env.example to .env and fill it in. ` +
        `The token must come from the Weyos Atlassian account.`,
    );
  }
  return {
    baseUrl: env.JIRA_BASE_URL.replace(/\/+$/, ""),
    email: env.JIRA_EMAIL,
    token: env.JIRA_API_TOKEN,
    projectKey: env.JIRA_PROJECT_KEY ?? "",
  };
}

/** Strip anything that looks like a credential out of a string before it can be printed. */
export function redact(text, cfg) {
  if (typeof text !== "string") return text;
  let out = text;
  if (cfg?.token) out = out.split(cfg.token).join("[REDACTED]");
  if (cfg?.email) out = out.split(cfg.email).join("[REDACTED]");
  return out.replace(/Basic\s+[A-Za-z0-9+/=]+/g, "Basic [REDACTED]");
}

export class JiraClient {
  constructor(cfg = config()) {
    this.cfg = cfg;
    // Built once, held in a closure-ish field, and never surfaced.
    this.auth = "Basic " + Buffer.from(`${cfg.email}:${cfg.token}`).toString("base64");
  }

  /** Boards and sprints live on the Agile API, which is a different base path. */
  agile(method, path, body) {
    return this.raw(method, `/rest/agile/1.0${path}`, body);
  }

  request(method, path, body) {
    return this.raw(method, `/rest/api/3${path}`, body);
  }

  async raw(method, path, body) {
    const url = `${this.cfg.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        authorization: this.auth,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await response.text();
    if (!response.ok) {
      // Jira echoes parts of the request in some errors. Redact before it reaches a terminal
      // or a CI log.
      throw new Error(
        `${method} ${path} -> ${response.status}\n${redact(text.slice(0, 800), this.cfg)}`,
      );
    }
    return text === "" ? null : JSON.parse(text);
  }

  /** Who the token belongs to. The cheapest way to prove a credential works. */
  myself() {
    return this.request("GET", "/myself");
  }

  projects(maxResults = 50) {
    return this.request("GET", `/project/search?maxResults=${maxResults}`);
  }

  search(jql, fields = ["summary", "status", "issuetype", "labels"], maxResults = 100) {
    return this.request("POST", "/search/jql", { jql, fields, maxResults });
  }

  createIssue(fields) {
    return this.request("POST", "/issue", { fields });
  }

  transitions(issueKey) {
    return this.request("GET", `/issue/${issueKey}/transitions`);
  }

  transition(issueKey, transitionId) {
    return this.request("POST", `/issue/${issueKey}/transitions`, {
      transition: { id: transitionId },
    });
  }
}
