/**
 * Prompt fragments shared across every locally-authored automation.
 *
 * Split out from `local-automation-catalog.ts` so the bespoke Proactivation
 * setup wizard (`src/utils/proactivation-prompt.ts`) and the Jira instant
 * trigger builder (`jira-trigger-setup.ts`) get exactly the same discipline as
 * the catalog entries, rather than maintaining their own copies that can drift
 * — which is exactly what happened before this file existed: the wizard had
 * its own honesty language and no `PR_BODY_RULE` equivalent at all.
 */

/** Shared closing rule so no automation fabricates work it could not do. */
export const HONESTY_RULE =
  "If a required integration or tool is not connected, or you cannot access the repository, stop immediately and report exactly what is missing. Never invent findings, issues, or results.";

/**
 * Shared rule for anything that writes a PR/issue/comment body through the
 * shell. Passing markdown with backticks or newlines through `gh ... --body
 * "..."` is fragile: a shell can interpret backticked text as command
 * substitution (silently stripping it), and a quoting slip can leave literal
 * \n characters instead of real line breaks -- both were observed in real
 * automation runs. Writing the body to a file sidesteps shell interpretation.
 */
export const PR_BODY_RULE =
  "When writing a pull request, issue, or comment body with gh, write the text to a temporary file first and pass it with --body-file, never with an inline --body string. This avoids the shell mangling markdown backticks or newlines in the text.";

/**
 * Every branch an automation creates gets a predictable `neodevex/<slug>/...`
 * name. Two independent things depend on this: the "check gh pr list /
 * existing branches first" dedup instruction only actually prevents duplicate
 * PRs if branch names are predictable enough to search for, and the Pull
 * Requests review page correlates a real GitHub PR back to the automation
 * that opened it by this exact prefix -- there is no other durable link
 * between an `AutomationRun` and the PR it produces.
 */
export function branchNamingRule(slug: string): string {
  return `Name any branch you create "neodevex/${slug}/<short-description>" (for example "neodevex/${slug}/fix-thing") -- never a generic name like "fix" or "patch".`;
}
