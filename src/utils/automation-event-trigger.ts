/**
 * GitHub event triggers for the app. The builder lives in
 * scripts/automation-event-trigger.mjs so the GitHub event bridge scopes
 * triggers created outside the app with the same rules.
 */
export {
  CI_SOURCE,
  GITHUB_TRIGGER_EVENTS,
  buildGitHubEventTrigger,
  parseGitHubEventTrigger,
  repoClause,
  repoSlug,
} from "../../scripts/automation-event-trigger.mjs";

export type GitHubTriggerEvent =
  | "issue_opened"
  | "issue_comment"
  | "pr_opened"
  | "push"
  | "ci_failed";
