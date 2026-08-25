/**
 * Builds the automation-service create-request body for a Jira instant
 * trigger, deliberately NOT going through `automation-setup.ts`'s generic
 * `buildCreatePayload`.
 *
 * That module hardcodes an event trigger's `source` to the chosen
 * repository's git provider (`repoPicker.field.provider` -- see
 * `automation-setup.ts:117-126`) because it mirrors an external contract-test
 * fixture (`extra="forbid"` on the create model) meant for git-provider
 * events (PR opened, push). A Jira issue event has no git provider at all,
 * so there is no way to express `source: "jira"` through that path without
 * bending a module that explicitly isn't meant to bend. This is a small,
 * separate builder for the one shape that path can't produce; the generic
 * manifest system and the existing cron-based `neodevex-jira-issue-to-pr`
 * preset (`local-automation-catalog.ts`) are untouched.
 */

import type { SetupRequestBody } from "./types";
import { HONESTY_RULE } from "./local-automation-catalog";

export interface JiraTriggerFormValues {
  projectKey: string;
  labelFilter?: string;
  readyStatus: string;
  repository: string;
  branch?: string;
}

/** Jira project keys and labels are alphanumeric-with-hyphens/underscores by
 * Jira's own rules; stripping quotes is enough to keep a typed value from
 * breaking out of the JMESPath string literal it's interpolated into. */
function sanitizeForFilterLiteral(value: string): string {
  return value.replace(/['"]/g, "").trim();
}

function buildFilter(values: JiraTriggerFormValues): string {
  const parts = [
    `fields.project.key == '${sanitizeForFilterLiteral(values.projectKey)}'`,
  ];
  const label = values.labelFilter
    ? sanitizeForFilterLiteral(values.labelFilter)
    : "";
  if (label) {
    parts.push(`contains(fields.labels, '${label}')`);
  }
  return parts.join(" && ");
}

function buildPrompt(values: JiraTriggerFormValues, cloudId: string): string {
  const jqlLabelClause = values.labelFilter
    ? ` AND labels = "${sanitizeForFilterLiteral(values.labelFilter)}"`
    : "";
  const apiBase = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`;

  return (
    `A Jira issue trigger fired for project ${values.projectKey}. There is no Jira MCP integration here -- call Jira directly with curl, using the bearer token in the $JIRA_TOKEN environment variable.\n\n` +
    `1. Fetch matching issues: curl -s -H "Authorization: Bearer $JIRA_TOKEN" -H "Accept: application/json" "${apiBase}/search?jql=project%3D${values.projectKey}+AND+status%3D%22${encodeURIComponent(values.readyStatus)}%22${jqlLabelClause}". If $JIRA_TOKEN is unset or the request returns 401, stop and say exactly that -- do not guess at issues.\n` +
    `2. For each issue, check 'gh pr list' and existing branches for the Jira key and skip anything already in progress. Never open a duplicate.\n` +
    `3. Take the highest-priority unstarted issue. Fetch its full description and acceptance criteria: curl -s -H "Authorization: Bearer $JIRA_TOKEN" "${apiBase}/issue/{key}". If the requirements are too ambiguous to implement safely, comment on the issue instead (POST ${apiBase}/issue/{key}/comment) asking the specific question, and move on rather than guessing.\n` +
    `4. Implement the change on a branch named for the Jira key, in ${values.repository}${values.branch ? ` (base branch ${values.branch})` : ""}, and add tests that prove the acceptance criteria are met.\n` +
    `5. Run the relevant test suite until green. If you cannot get it green, do not open a pull request; report what blocked you.\n` +
    `6. Open a pull request titled with the Jira key, describing what you implemented and the tests you ran. Comment the pull request link back on the Jira issue via curl. Never merge it yourself.\n\n` +
    `If no issues match, end the run stating there was nothing ready. That is a successful run.\n\n${HONESTY_RULE}`
  );
}

/**
 * `cloudId` comes from the caller's already-loaded Jira connection (it's
 * plain identifying data, not a secret) and gets baked directly into the
 * prompt so the agent knows which Jira site to call without needing another
 * round trip.
 */
export function buildJiraTriggerPayload(
  values: JiraTriggerFormValues,
  cloudId: string,
): SetupRequestBody {
  return {
    name: `Jira Issue to PR - ${values.repository}`,
    prompt: buildPrompt(values, cloudId),
    repos: [
      {
        url: values.repository,
        provider: "github",
        ...(values.branch && { ref: values.branch }),
      },
    ],
    trigger: {
      type: "event",
      source: "jira",
      on: ["jira:issue_created", "jira:issue_updated"],
      filter: buildFilter(values),
    },
  };
}
