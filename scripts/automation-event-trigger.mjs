/**
 * GitHub event triggers for automations: how a plain-language choice ("when a
 * pull request is opened, branch starts with release/") becomes the service's
 * `{ type: "event", source, on, filter }` trigger, and how every GitHub
 * trigger is scoped to its own repository.
 *
 * Scoping matters because openhands-automation matches events by type and
 * JMESPath filter only: a push to repo X fired every push automation in the
 * org, including ones set up for repo Y. Devin ties each trigger to one
 * repository; NeoDevEx now does the same by putting the repository in the
 * filter. The GitHub event bridge applies `scopeTriggerToRepo` to automations
 * created any other way (chat agent, API, older app versions).
 *
 * Plain JS in scripts/ (node: builtins only) because the app, the bridge, the
 * desktop app and the Docker image all need it; src/utils re-exports it.
 */

export const CI_SOURCE = "github-ci";

/**
 * @typedef {"issue_opened" | "issue_comment" | "pr_opened" | "push" | "ci_failed"} GitHubTriggerEvent
 * @typedef {{ type: "event", source: string, on: string, filter?: string }} EventTrigger
 */

/** @type {Record<GitHubTriggerEvent, { source: string, on: string, match: (value: string) => string }>} */
const EVENTS = {
  issue_opened: {
    source: "github",
    on: "issues.opened",
    match: (v) => `icontains(issue.title, ${literal(v)})`,
  },
  issue_comment: {
    source: "github",
    on: "issue_comment.created",
    match: (v) => `icontains(comment.body, ${literal(v)})`,
  },
  pr_opened: {
    source: "github",
    on: "pull_request.opened",
    match: (v) => `starts_with(pull_request.head.ref, ${literal(v)})`,
  },
  push: {
    source: "github",
    on: "push",
    match: (v) => `ref == ${literal(`refs/heads/${v}`)}`,
  },
  ci_failed: {
    source: CI_SOURCE,
    on: "workflow_run.failure",
    match: (v) => `starts_with(workflow_run.head_branch, ${literal(v)})`,
  },
};

/** @type {GitHubTriggerEvent[]} */
export const GITHUB_TRIGGER_EVENTS = /** @type {GitHubTriggerEvent[]} */ (
  Object.keys(EVENTS)
);

/**
 * A JMESPath raw string literal.
 * @param {string} value
 */
function literal(value) {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * owner/repo from a repo url or slug; null when it is not a GitHub repo.
 * @param {string | null | undefined} url
 */
export function repoSlug(url) {
  if (!url) return null;
  const m = String(url)
    .trim()
    .match(
      /^(?:https?:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/,
    );
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Filter clause that limits a trigger to one repository.
 * @param {string} slug owner/repo
 */
export function repoClause(slug) {
  return `repository.full_name == ${literal(slug)}`;
}

/**
 * @param {string | undefined} filter
 * @param {string} slug
 */
function withRepoClause(filter, slug) {
  const clause = repoClause(slug);
  return filter?.trim() ? `${clause} && (${filter.trim()})` : clause;
}

/**
 * The trigger for a GitHub event, scoped to `repo`, with an optional
 * condition (`match`) whose meaning depends on the event: title contains,
 * comment contains, head branch starts with, pushed branch, CI branch starts
 * with.
 * @param {GitHubTriggerEvent} event
 * @param {string} repo owner/repo or a GitHub URL
 * @param {string} [match]
 * @returns {EventTrigger}
 */
export function buildGitHubEventTrigger(event, repo, match) {
  const spec = EVENTS[event];
  const slug = repoSlug(repo);
  if (!spec) throw new Error(`Unknown GitHub trigger event: ${event}`);
  if (!slug) throw new Error(`Not a GitHub repository: ${repo}`);
  const condition = match?.trim() ? spec.match(match.trim()) : undefined;
  return {
    type: "event",
    source: spec.source,
    on: spec.on,
    filter: withRepoClause(condition, slug),
  };
}

/**
 * The automation's trigger scoped to its one GitHub repository, or null when
 * it needs no change: not a GitHub/CI event trigger, already scoped, or not
 * exactly one GitHub repository to scope to.
 * @param {{ trigger?: any, preset_metadata?: { repos?: { url?: string }[] } }} automation
 * @returns {EventTrigger | null}
 */
export function scopeTriggerToRepo(automation) {
  const trigger = automation.trigger;
  if (!trigger || trigger.type !== "event") return null;
  if (trigger.source !== "github" && trigger.source !== CI_SOURCE) return null;
  if (
    typeof trigger.filter === "string" &&
    trigger.filter.includes("repository.full_name")
  ) {
    return null;
  }
  const slugs = (automation.preset_metadata?.repos ?? [])
    .map((r) => repoSlug(r.url))
    .filter(Boolean);
  if (slugs.length !== 1) return null;
  return { ...trigger, filter: withRepoClause(trigger.filter, slugs[0]) };
}

/**
 * @param {string} s
 */
function unliteral(s) {
  return s.replace(/\\(['\\])/g, "$1");
}

const LITERAL = "'((?:[^'\\\\]|\\\\.)*)'";

/** @type {Record<GitHubTriggerEvent, RegExp>} */
const MATCH_PATTERNS = {
  issue_opened: new RegExp(`^icontains\\(issue\\.title, ${LITERAL}\\)$`),
  issue_comment: new RegExp(`^icontains\\(comment\\.body, ${LITERAL}\\)$`),
  pr_opened: new RegExp(
    `^starts_with\\(pull_request\\.head\\.ref, ${LITERAL}\\)$`,
  ),
  push: new RegExp(`^ref == 'refs/heads/((?:[^'\\\\]|\\\\.)*)'$`),
  ci_failed: new RegExp(
    `^starts_with\\(workflow_run\\.head_branch, ${LITERAL}\\)$`,
  ),
};

/**
 * The plain-language form of a trigger built by `buildGitHubEventTrigger`,
 * or null when the trigger was written some other way (a hand-written
 * filter, Jira, a custom webhook) and can only be shown as-is.
 * @param {any} trigger
 * @returns {{ event: GitHubTriggerEvent, repo: string, match: string } | null}
 */
export function parseGitHubEventTrigger(trigger) {
  if (!trigger || trigger.type !== "event") return null;
  const event = GITHUB_TRIGGER_EVENTS.find(
    (e) => EVENTS[e].source === trigger.source && EVENTS[e].on === trigger.on,
  );
  if (!event || typeof trigger.filter !== "string") return null;
  const scoped = new RegExp(
    `^repository\\.full_name == ${LITERAL}(?: && \\((.*)\\))?$`,
  ).exec(trigger.filter.trim());
  if (!scoped) return null;
  const repo = unliteral(scoped[1]);
  if (scoped[2] === undefined) return { event, repo, match: "" };
  const condition = MATCH_PATTERNS[event].exec(scoped[2]);
  return condition ? { event, repo, match: unliteral(condition[1]) } : null;
}
