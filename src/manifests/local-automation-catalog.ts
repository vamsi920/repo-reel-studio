/**
 * Automation catalog entries this fork owns.
 *
 * The published `@openhands/extensions` catalog is the upstream source, but it
 * cannot be extended from here and most of its entries ship no `setup` block —
 * selecting one of those only opens a seeded chat, so nothing is ever persisted
 * to the automation service. Entries declared here close that gap: every one is
 * `mode: "direct"`, so completing its form performs a single
 * `POST /api/automation/v1/preset/prompt` and the service returns a real,
 * enabled, scheduled automation.
 *
 * An entry whose `id` matches a published one deliberately *replaces* it (see
 * `AUTOMATION_CATALOG_ALL` in `manifest-sources.ts`), which is how the
 * chat-only upstream entries become automations that actually run.
 *
 * Two deliberate constraints, both learned from the live service:
 *
 * - **Cron, never event.** Event triggers only fire when a webhook reaches the
 *   deployment. On a local stack nothing does, so an event-triggered card would
 *   be created successfully and then sit idle forever. Every entry here polls
 *   on a schedule instead, which works with no tunnel and no webhook config.
 *   The service enforces a 300s floor, so no default polls more often
 *   than every five minutes.
 * - **No `requires.features`.** The capability gate marks an entry unsupported
 *   when a declared feature is missing from what the deployment reports, and a
 *   card that renders "unavailable" is worse than one that runs. Trigger-kind
 *   support (`cron`) is still checked and is universally reported.
 *
 * Every prompt ends by telling the agent to stop and say what is missing rather
 * than invent an answer when a tool or integration is not connected — the same
 * discipline `bug-fixer-connectors.tsx` uses.
 */

import type { RecommendedAutomation } from "@openhands/extensions/automations";
import type { SetupFormField } from "./types";
import {
  branchNamingRule,
  HONESTY_RULE,
  PR_BODY_RULE,
} from "./automation-prompt-rules";

export { HONESTY_RULE, PR_BODY_RULE } from "./automation-prompt-rules";

/** Shared cron trigger fields. Kept identical so schedules read the same everywhere. */
function cronTrigger(
  defaultSchedule: string,
  help: string,
): Record<string, SetupFormField> {
  return {
    schedule: {
      type: "cron",
      label: "Schedule",
      help,
      default: defaultSchedule,
      required: true,
    },
    timezone: {
      type: "timezone",
      label: "Timezone",
      help: "Timezone the schedule is interpreted in.",
      default: "UTC",
      required: true,
    },
  };
}

/** Shared repository field. Renders a picker on cloud, a text box on local. */
const repositoryField: SetupFormField = {
  type: "repo-picker",
  label: "Repository",
  help: "The repository this automation works in, as owner/repo.",
  provider: "github",
  required: true,
};

export const LOCAL_AUTOMATION_CATALOG: RecommendedAutomation[] = [
  {
    id: "neodevex-proactive-engineering",
    name: "Proactive Engineering",
    category: "Code quality",
    description:
      "Neo reviews the repository on a schedule, finds one well-evidenced improvement, verifies it is real, and prepares the change according to the autonomy level you choose.",
    requires: {
      integrations: {
        github: {
          message: "Used to read the repository and open pull requests.",
          required: false,
        },
      },
    },
    popularityRank: 200,
    estimatedSetupMinutes: 2,
    exampleImplementation:
      "Trigger: cron. Loads repository and workspace context, checks memory for previously dismissed suggestions, ranks improvement candidates across the selected areas, verifies the strongest one, and then recommends, prepares a fix, or opens a pull request depending on the autonomy level.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        note: "Runs up to six times a day. Most runs finish with 'No meaningful improvements found' when nothing is worth changing -- that is a successful run, not a shortfall.",
        triggers: {
          cron: cronTrigger(
            "0 */4 * * *",
            "How often Neo reviews the repository.",
          ),
        },
        args: {
          repository: repositoryField,
          watchAreas: {
            type: "select",
            label: "What to watch",
            help: "Which kinds of improvement Neo looks for.",
            default: "dependencies-tests-code-quality",
            required: true,
            options: [
              {
                value: "dependencies-tests-code-quality",
                label: "Dependencies, tests and code quality",
              },
              { value: "dependencies", label: "Dependencies only" },
              { value: "tests", label: "Tests only" },
              { value: "code-quality", label: "Code quality only" },
              {
                value: "documentation-repository-health",
                label: "Documentation and repository health",
              },
            ],
          },
          autonomyLevel: {
            type: "select",
            label: "Autonomy level",
            help: "How far Neo may go without you.",
            default: "recommend",
            required: true,
            options: [
              { value: "recommend", label: "Recommend only, no code changes" },
              {
                value: "prepare-fix",
                label: "Prepare a fix on a branch, no pull request",
              },
              {
                value: "create-pr",
                label: "Open a pull request when verified",
              },
            ],
          },
        },
      },
      prompt:
        "You are running a Proactivation pass for {{form.repository}} on behalf of the user who enabled it.\n\n1. Load repository context and understand the current state before looking for problems.\n2. Check '.neodevex/memory' for previously dismissed candidates and previous Proactivation fixes. Do not re-propose something already dismissed, and check 'gh pr list' and existing branches so you never duplicate open work.\n3. Look for improvement candidates only in this area selection: {{form.watchAreas}}.\n4. Rank what you find and pick the single strongest candidate. Quality beats quantity. If nothing is genuinely worth changing, end the run by stating 'No meaningful improvements found' — that is a valid, successful outcome. Never invent a vague suggestion such as 'improve code quality'; name specific files, functions or configuration and explain why it matters.\n5. Verify the candidate is a real issue before proposing anything.\n6. Report what you found, why it matters, the evidence, the suggested change, and the risk level.\n\nAutonomy level for this run is {{form.autonomyLevel}}. If it is 'recommend', do not modify any files. If it is 'prepare-fix', create an isolated branch, make the change, run the relevant tests, and leave it committed locally without pushing or opening a pull request. If it is 'create-pr', do all of that and then push the branch and open a pull request following the repository conventions. Never merge a pull request and never deploy.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("proactive-engineering"),
    },
  },
  {
    id: "neodevex-continuous-agent",
    name: "Continuous Improvement Agent",
    category: "Code quality",
    description:
      "Runs frequently in the background, picks up where the last run finished, and works through a standing backlog of small verified improvements without waiting to be asked.",
    requires: {
      integrations: {
        github: {
          message: "Used to read the repository and open pull requests.",
          required: false,
        },
      },
    },
    popularityRank: 195,
    estimatedSetupMinutes: 2,
    exampleImplementation:
      "Trigger: frequent cron. Reads a persistent backlog note from the repository, continues the highest-value unfinished item, verifies it with tests, and records what it did so the next run resumes cleanly.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        note: "Runs often and does a small amount of verified work each time. The service enforces a five minute minimum interval.",
        triggers: {
          cron: cronTrigger("*/30 * * * *", "How often the agent wakes up."),
        },
        args: {
          repository: repositoryField,
          focus: {
            type: "textarea",
            label: "Standing focus",
            help: "What this agent should keep working on, in your own words.",
            default:
              "Reduce duplicated logic, remove dead code, and improve test coverage around frequently changed files.",
            required: true,
          },
          changePolicy: {
            type: "select",
            label: "Change policy",
            help: "What the agent may do once it has verified an improvement.",
            default: "prepare-fix",
            required: true,
            options: [
              { value: "recommend", label: "Report only, no code changes" },
              {
                value: "prepare-fix",
                label: "Prepare a branch, no pull request",
              },
              {
                value: "create-pr",
                label: "Open a pull request when verified",
              },
            ],
          },
        },
      },
      prompt:
        "You are the continuous improvement agent for {{form.repository}}. Standing focus: {{form.focus}}\n\nEach run does a small amount of genuinely verified work, then stops cleanly so the next run can resume.\n\n1. Read '.neodevex/memory' and any notes from your previous runs to see what you already did, already proposed, and what was rejected. Check 'gh pr list' and existing branches so you never repeat open work.\n2. Choose exactly one worthwhile item that fits the standing focus. If there is nothing worth doing right now, end the run stating 'No meaningful improvements found' and stop. Do not manufacture work.\n3. Investigate it properly and confirm it is real.\n4. Apply the change policy {{form.changePolicy}}: 'recommend' means do not modify files; 'prepare-fix' means branch, change, run the relevant tests, and leave it committed locally without pushing; 'create-pr' means also push and open a pull request. Never merge and never deploy.\n5. Record what you did and what you would pick up next, so the following run continues rather than restarts.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("continuous-agent"),
    },
  },
  {
    id: "neodevex-github-issue-fixer",
    name: "GitHub Issue Fixer",
    category: "Developer tools",
    description:
      "Polls a repository for open issues carrying a label, reproduces the problem, implements a minimal fix, runs the tests, and opens a pull request that closes the issue.",
    requires: {
      integrations: {
        github: {
          message: "Used to read issues and open pull requests.",
          required: false,
        },
      },
    },
    popularityRank: 190,
    estimatedSetupMinutes: 3,
    exampleImplementation:
      "Trigger: cron polling. Lists open issues with the configured label, skips ones that already have a linked pull request or branch, reproduces the failure, writes a regression test, fixes it, and opens a pull request linking the issue.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        triggers: {
          cron: cronTrigger(
            "*/30 * * * *",
            "How often to poll for newly labelled issues.",
          ),
        },
        args: {
          repository: repositoryField,
          issueLabel: {
            type: "text",
            label: "Issue label",
            help: "Only issues carrying this label are picked up.",
            default: "neodevex-fix",
            required: true,
            constraints: { minLength: 1, maxLength: 50 },
          },
          maxIssues: {
            type: "select",
            label: "Issues per run",
            help: "How many issues to attempt in a single run.",
            default: "1",
            required: true,
            options: [
              { value: "1", label: "One issue per run" },
              { value: "3", label: "Up to three issues per run" },
            ],
          },
        },
      },
      prompt:
        "Poll {{form.repository}} for open issues labelled '{{form.issueLabel}}' and fix up to {{form.maxIssues}} of them this run.\n\nFor each issue you take on:\n1. Read the full issue, including comments and any linked context.\n2. Skip it if a pull request or branch already addresses it — check 'gh pr list' and existing branches first, and never open a duplicate.\n3. Reproduce the problem and find the true root cause. Do not guess from the title.\n4. Make the smallest correct fix. Add or update a regression test that fails before the fix and passes after it.\n5. Run the relevant test suite and keep working until it is green. If you cannot make it green, do not open a pull request — report what blocked you.\n6. Open a pull request that explains the root cause, the fix, and the tests you ran, and links the issue so it closes on merge. Never merge it yourself.\n\nIf there are no matching issues, end the run stating that there was nothing to do. That is a successful run.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("github-issue-fixer"),
    },
  },
  {
    id: "neodevex-dependency-updater",
    name: "Dependency Updater",
    category: "Developer tools",
    description:
      "Checks for outdated and deprecated dependencies on a schedule, reads the changelogs, upgrades the safe ones, runs the test suite, and opens a reviewed pull request.",
    requires: {
      integrations: {
        github: {
          message: "Used to read the repository and open pull requests.",
          required: false,
        },
      },
    },
    popularityRank: 185,
    estimatedSetupMinutes: 2,
    exampleImplementation:
      "Trigger: cron. Runs the ecosystem's outdated check, groups upgrades by risk, reads changelogs for breaking changes, applies the safe group, runs tests, and opens a pull request summarising every version change.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        triggers: {
          cron: cronTrigger("0 9 * * 1", "How often to check dependencies."),
        },
        args: {
          repository: repositoryField,
          updateScope: {
            type: "select",
            label: "Update scope",
            help: "How adventurous the upgrades may be.",
            default: "patch-minor",
            required: true,
            options: [
              { value: "patch", label: "Patch versions only" },
              { value: "patch-minor", label: "Patch and minor versions" },
              {
                value: "all-including-major",
                label: "Include major versions, reviewed individually",
              },
            ],
          },
          challengeMode: {
            type: "select",
            label: "When tests fail",
            help: "What to do if the upgrade breaks the test suite.",
            default: "fix",
            required: true,
            options: [
              { value: "fix", label: "Try to fix the breakage" },
              { value: "drop", label: "Drop that dependency from the upgrade" },
            ],
          },
        },
      },
      prompt:
        "Check {{form.repository}} for outdated and deprecated dependencies. Update scope: {{form.updateScope}}.\n\n1. Detect the ecosystem and run its outdated check. Do not assume a package manager.\n2. Check 'gh pr list' for an existing dependency update pull request and do not open a duplicate.\n3. For every candidate upgrade, read the changelog or release notes and identify breaking changes. Exclude anything outside the update scope.\n4. Apply the upgrades, then run the full relevant test suite.\n5. If tests fail, follow the policy {{form.challengeMode}}: 'fix' means investigate and repair the breakage; 'drop' means remove that dependency from the batch and re-run.\n6. Open a pull request listing each package with its old and new version, the reason it was upgraded, notable changelog entries, the tests you ran, and any risk worth a reviewer's attention. Never merge it yourself.\n\nIf everything is already current, end the run stating that no upgrades were needed.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("dependency-updater"),
    },
  },
  {
    id: "neodevex-ci-failure-fixer",
    name: "CI Failure Fixer",
    category: "Developer tools",
    description:
      "Watches recent CI runs for repeated or newly broken builds, reads the logs to find the real cause, fixes it, and opens a pull request once the pipeline is green again.",
    requires: {
      integrations: {
        github: {
          message: "Used to read workflow runs and open pull requests.",
          required: false,
        },
      },
    },
    popularityRank: 180,
    estimatedSetupMinutes: 3,
    exampleImplementation:
      "Trigger: cron. Lists recent failed workflow runs, groups them by failing job and error signature, distinguishes a flaky test from a real regression, fixes the underlying cause, and opens a pull request.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        triggers: {
          cron: cronTrigger("0 */4 * * *", "How often to check CI health."),
        },
        args: {
          repository: repositoryField,
          watchBranch: {
            type: "text",
            label: "Branch to watch",
            help: "Which branch's CI runs to inspect.",
            default: "main",
            required: true,
            constraints: { minLength: 1, maxLength: 100 },
          },
          failureKind: {
            type: "select",
            label: "What to act on",
            help: "Which kind of CI failure this automation should fix.",
            default: "consistent",
            required: true,
            options: [
              { value: "consistent", label: "Consistently failing builds" },
              { value: "flaky", label: "Flaky and intermittent failures" },
              { value: "any", label: "Any failing build" },
            ],
          },
        },
      },
      prompt:
        "Inspect recent CI runs for the '{{form.watchBranch}}' branch of {{form.repository}}. Act on failures of kind: {{form.failureKind}}.\n\n1. List recent workflow runs and find the failing ones. If CI history is not accessible, stop and say so rather than guessing.\n2. Group failures by job and error signature so you fix a cause, not a symptom. Distinguish a genuinely flaky test from a real regression by comparing runs on the same commit.\n3. Check 'gh pr list' for an existing fix and do not duplicate it.\n4. Read the actual failure logs, reproduce the failure locally where possible, and find the root cause.\n5. Fix it, then run the relevant tests until green. A flaky test should be made deterministic, not retried or skipped, unless skipping is genuinely the right call and you explain why.\n6. Open a pull request explaining the failure, the root cause, the fix, and the evidence it is resolved. Never merge it yourself.\n\nIf CI is healthy, end the run stating that no failures needed attention.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("ci-failure-fixer"),
    },
  },
  // ── Replacements for published entries that ship no runnable setup ─────────
  // Same ids as `@openhands/extensions`, so these take their place in the
  // merged catalog. Upstream, selecting one of these only opened a chat.

  {
    id: "neodevex-jira-issue-to-pr",
    name: "Jira Issue to PR",
    category: "Project management",
    description:
      "Polls a Jira project for newly ready issues, implements each one in the repository, runs the tests, opens a pull request, and moves the issue forward.",
    requires: {
      integrations: {
        jira: {
          message: "Used to read issues and update their status.",
          required: false,
        },
        github: {
          message: "Used to implement the change and open pull requests.",
          required: false,
        },
      },
    },
    popularityRank: 175,
    estimatedSetupMinutes: 4,
    exampleImplementation:
      "Trigger: cron polling. Queries the Jira project for issues in the configured status, deduplicates against issues that already have a branch or pull request, implements the change, and links the pull request back to the Jira key.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        note: "Needs the Jira MCP integration connected. Without it the run will stop and tell you so rather than do nothing quietly.",
        triggers: {
          cron: cronTrigger("*/30 * * * *", "How often to poll Jira."),
        },
        args: {
          repository: repositoryField,
          projectKey: {
            type: "text",
            label: "Jira project key",
            help: "The project to poll, for example PAY.",
            required: true,
            placeholder: "PAY",
            constraints: { minLength: 1, maxLength: 20 },
          },
          readyStatus: {
            type: "text",
            label: "Status to pick up",
            help: "Only issues in this status are implemented.",
            default: "Ready for Development",
            required: true,
            constraints: { minLength: 1, maxLength: 60 },
          },
        },
      },
      prompt:
        "Poll the Jira project {{form.projectKey}} for issues in status '{{form.readyStatus}}' and implement them in {{form.repository}}.\n\n1. Use the Jira integration to list matching issues. If Jira is not connected, stop and say exactly that.\n2. For each issue, check 'gh pr list' and existing branches for the Jira key and skip anything already in progress. Never open a duplicate.\n3. Take the highest-priority unstarted issue. Read its full description and acceptance criteria. If the requirements are too ambiguous to implement safely, comment on the issue asking the specific question and move on rather than guessing.\n4. Implement the change on a branch named for the Jira key, and add tests that prove the acceptance criteria are met.\n5. Run the relevant test suite until green. If you cannot get it green, do not open a pull request; report what blocked you.\n6. Open a pull request titled with the Jira key, describing what you implemented and the tests you ran. Comment the pull request link on the Jira issue. Never merge it yourself.\n\nIf no issues match, end the run stating there was nothing ready. That is a successful run.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("jira-issue-to-pr"),
    },
  },
  {
    id: "neodevex-linear-triage",
    name: "Linear Triage Assistant",
    category: "Project management",
    description:
      "Reviews untriaged Linear issues on a schedule, adds the missing detail, applies consistent labels and priority, and flags the ones that need a human decision.",
    requires: {
      integrations: {
        linear: {
          message: "Used to read and update issues in your workspace.",
          required: false,
        },
      },
    },
    popularityRank: 170,
    estimatedSetupMinutes: 3,
    exampleImplementation:
      "Trigger: cron. Lists issues in the triage state, compares each against the team's labelling conventions, sets labels and priority, requests missing reproduction detail, and escalates ambiguous ones.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        note: "Needs the Linear MCP integration connected.",
        triggers: {
          cron: cronTrigger("0 9 * * 1-5", "How often to triage."),
        },
        args: {
          teamKey: {
            type: "text",
            label: "Linear team",
            help: "The team whose triage queue to review.",
            required: true,
            placeholder: "ENG",
            constraints: { minLength: 1, maxLength: 40 },
          },
          triageDepth: {
            type: "select",
            label: "How far to go",
            help: "Whether the assistant may change issues or only comment.",
            default: "label-and-comment",
            required: true,
            options: [
              { value: "comment-only", label: "Comment with suggestions only" },
              {
                value: "label-and-comment",
                label: "Apply labels and priority, and comment",
              },
            ],
          },
        },
      },
      prompt:
        "Review the untriaged issues for the Linear team {{form.teamKey}}.\n\n1. Use the Linear integration to list issues awaiting triage. If Linear is not connected, stop and say exactly that.\n2. For each issue decide: is it a bug, a feature, or a question? Is there enough detail to act on? What priority does the described impact justify?\n3. Apply the policy {{form.triageDepth}}. With 'comment-only' do not modify any issue field; only leave a comment with your recommendation. With 'label-and-comment' set the labels and priority you determined, and comment explaining why.\n4. When an issue lacks reproduction steps, expected behaviour, or scope, ask for precisely what is missing rather than closing it.\n5. Escalate anything that needs a human product decision instead of guessing, and say why.\n\nSummarise what you triaged and what still needs a human. If the queue is empty, say so.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("linear-triage"),
    },
  },
  {
    id: "neodevex-slack-channel-monitor",
    name: "Slack Channel Monitor",
    category: "Team communication",
    description:
      "Reads a Slack channel on a schedule, surfaces the questions and problems that have gone unanswered, and posts a short digest so nothing is quietly dropped.",
    requires: {
      integrations: {
        slack: {
          message: "Used to read the channel and post the digest.",
          required: false,
        },
      },
    },
    popularityRank: 165,
    estimatedSetupMinutes: 3,
    exampleImplementation:
      "Trigger: cron. Reads messages since the previous run, identifies unanswered questions, reports, and requests, and posts a threaded digest tagging what still needs an owner.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        note: "Needs the Slack MCP integration connected.",
        triggers: {
          cron: cronTrigger("0 */4 * * *", "How often to read the channel."),
        },
        args: {
          channelName: {
            type: "text",
            label: "Channel",
            help: "The channel to monitor, without the hash.",
            required: true,
            placeholder: "support",
            constraints: { minLength: 1, maxLength: 80 },
          },
          watchFor: {
            type: "textarea",
            label: "What matters",
            help: "What this monitor should surface.",
            default:
              "Unanswered questions, reported bugs, and anything that sounds like an outage or a blocked customer.",
            required: true,
          },
        },
      },
      prompt:
        "Read the recent messages in the Slack channel '{{form.channelName}}' and surface what matters: {{form.watchFor}}\n\n1. Use the Slack integration to read messages since your previous run. If Slack is not connected, stop and say exactly that.\n2. Identify only the items that genuinely match what matters. An active discussion with a clear answer is not an open item.\n3. For each open item note who raised it, when, a one-line summary, and whether anyone has responded.\n4. Post a single short digest to the channel listing the open items oldest first, and say plainly when there are none.\n\nDo not post a digest of everything that was said. Only what still needs someone.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("slack-channel-monitor"),
    },
  },
  {
    id: "neodevex-slack-standup-digest",
    name: "Slack Standup Digest",
    category: "Team updates",
    description:
      "Collects what the team actually shipped from the repository and posts a standup digest to Slack, so the update reflects real activity rather than memory.",
    requires: {
      integrations: {
        slack: {
          message: "Used to post the digest to your channel.",
          required: false,
        },
        github: {
          message: "Used to read merged pull requests and recent commits.",
          required: false,
        },
      },
    },
    popularityRank: 160,
    estimatedSetupMinutes: 3,
    exampleImplementation:
      "Trigger: cron on weekday mornings. Reads merged pull requests, notable commits, and open review requests since the previous digest, then posts a grouped summary to the channel.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        note: "Needs the Slack MCP integration connected.",
        triggers: {
          cron: cronTrigger("0 9 * * 1-5", "When to post the digest."),
        },
        args: {
          repository: repositoryField,
          channelName: {
            type: "text",
            label: "Channel",
            help: "Where to post the digest, without the hash.",
            required: true,
            placeholder: "team-standup",
            constraints: { minLength: 1, maxLength: 80 },
          },
          lookbackHours: {
            type: "select",
            label: "Look back",
            help: "How much recent activity the digest covers.",
            default: "24",
            required: true,
            options: [
              { value: "24", label: "Last 24 hours" },
              { value: "72", label: "Last 3 days" },
              { value: "168", label: "Last week" },
            ],
          },
        },
      },
      prompt:
        "Post a standup digest for {{form.repository}} to the Slack channel '{{form.channelName}}', covering the last {{form.lookbackHours}} hours.\n\n1. Read merged pull requests, notable commits, and pull requests still awaiting review in that window. If the repository or Slack is not accessible, stop and say exactly which one.\n2. Group the digest into what shipped, what is in review, and what looks stuck — a pull request open far longer than the rest of the window is stuck.\n3. Write it for people who were not watching the repository. Say what changed and why it matters, not just the pull request titles. Keep it short.\n4. Post it as a single message. If nothing merged in the window, say that plainly instead of padding the digest.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("slack-standup-digest"),
    },
  },
  {
    id: "neodevex-research-brief",
    name: "Research Brief Writer",
    category: "Research",
    description:
      "Researches a standing topic on a schedule, reads the sources rather than the summaries, and writes a dated brief with citations and an explicit note on what is still uncertain.",
    requires: {
      integrations: {
        tavily: {
          message: "Used to search the web for current sources.",
          required: false,
        },
        notion: {
          message: "Used to file the finished brief.",
          required: false,
        },
      },
    },
    popularityRank: 155,
    estimatedSetupMinutes: 3,
    exampleImplementation:
      "Trigger: cron. Runs a multi-angle search on the standing topic, opens and reads the strongest sources, synthesises a brief with citations, and files it to the configured destination.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        note: "Files to Notion when it is connected, and returns the brief in the run output otherwise.",
        triggers: {
          cron: cronTrigger("0 8 * * 1", "How often to produce a brief."),
        },
        args: {
          topic: {
            type: "textarea",
            label: "Topic",
            help: "What to research, stated as precisely as you can.",
            required: true,
            placeholder:
              "Changes in AI coding agent tooling that affect our roadmap",
          },
          depth: {
            type: "select",
            label: "Depth",
            help: "How much reading each brief should involve.",
            default: "standard",
            required: true,
            options: [
              { value: "quick", label: "Quick scan, headline findings" },
              { value: "standard", label: "Standard, read the main sources" },
              {
                value: "deep",
                label: "Deep, follow citations and primary sources",
              },
            ],
          },
        },
      },
      prompt:
        "Research this topic and write a brief: {{form.topic}}\n\nDepth: {{form.depth}}.\n\n1. Search from several different angles rather than one query, so you are not seeing a single slice of the topic. If the search integration is not connected, stop and say exactly that.\n2. Open and read the strongest sources. Do not write the brief from search snippets alone.\n3. Write the brief: what changed, why it matters, and what it implies. Cite every substantive claim with its source link.\n4. State plainly what you could not determine and where sources disagreed. Never fill a gap with a confident guess.\n5. File the brief to Notion if that integration is connected; otherwise return it in full in the run output.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("research-brief"),
    },
  },
  {
    id: "neodevex-incident-retrospective",
    name: "Incident Retrospective Drafter",
    category: "Reliability",
    description:
      "Turns an incident channel into a blameless retrospective draft — timeline, contributing causes, and concrete follow-up actions — ready for the team to review.",
    requires: {
      integrations: {
        slack: {
          message: "Used to read the incident channel discussion.",
          required: false,
        },
        linear: {
          message: "Used to file the follow-up actions.",
          required: false,
        },
        notion: {
          message: "Used to file the finished retrospective.",
          required: false,
        },
      },
    },
    popularityRank: 150,
    estimatedSetupMinutes: 4,
    exampleImplementation:
      "Trigger: cron. Detects recent incident channels, reconstructs the timeline from the discussion, drafts a blameless retrospective with contributing causes, and files follow-up actions.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        note: "Runs on a schedule and does nothing when there was no incident, which is the normal case.",
        triggers: {
          cron: cronTrigger("0 10 * * 1", "How often to check for incidents."),
        },
        args: {
          channelPattern: {
            type: "text",
            label: "Incident channel pattern",
            help: "How your incident channels are named, for example incident-.",
            default: "incident-",
            required: true,
            constraints: { minLength: 1, maxLength: 80 },
          },
          fileActions: {
            type: "select",
            label: "Follow-up actions",
            help: "What to do with the actions the retrospective identifies.",
            default: "draft-only",
            required: true,
            options: [
              { value: "draft-only", label: "List them in the draft only" },
              { value: "file-issues", label: "File them as issues" },
            ],
          },
        },
      },
      prompt:
        "Look for recent incident channels matching '{{form.channelPattern}}' and draft a blameless retrospective for any that do not have one yet.\n\n1. Use the Slack integration to find matching channels and read the discussion. If Slack is not connected, stop and say exactly that. If there was no recent incident, end the run saying so — that is the normal, successful case.\n2. Reconstruct the timeline from the messages: when it started, how it was detected, what was tried, what actually resolved it, and when.\n3. Identify contributing causes, not a single root cause, and never attribute fault to a person. Describe what the system allowed to happen.\n4. Derive concrete follow-up actions. Each one must be specific enough to act on and say what it prevents. Vague actions such as 'improve monitoring' are not acceptable.\n5. Apply the policy {{form.fileActions}}: 'draft-only' means list the actions in the draft; 'file-issues' means also file each as an issue if that integration is connected.\n6. Mark clearly anything you inferred rather than read directly, so reviewers know what to check.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("incident-retrospective"),
    },
  },
  {
    id: "neodevex-mention-responder",
    name: "GitHub Mention Responder",
    category: "Developer tools",
    description:
      "Polls a repository for comments that mention a trigger phrase and responds to each one in context — answering the question or making the requested change.",
    requires: {
      integrations: {
        github: {
          message: "Used to read comments and respond or open pull requests.",
          required: false,
        },
      },
    },
    popularityRank: 145,
    estimatedSetupMinutes: 3,
    exampleImplementation:
      "Trigger: cron polling, so it works without a public webhook endpoint. Lists recent issue and pull request comments containing the trigger phrase, deduplicates against comments already answered, and replies in the same thread.",
    setup: {
      version: "1.0",
      mode: "direct",
      form: {
        note: "Polls rather than using webhooks, so it works on a local deployment with no public endpoint.",
        triggers: {
          cron: cronTrigger("*/30 * * * *", "How often to check for mentions."),
        },
        args: {
          repository: repositoryField,
          triggerPhrase: {
            type: "text",
            label: "Trigger phrase",
            help: "Comments containing this phrase are answered.",
            default: "@neodevex",
            required: true,
            constraints: { minLength: 2, maxLength: 50 },
          },
          responseScope: {
            type: "select",
            label: "What it may do",
            help: "Whether it only answers, or may also change code.",
            default: "answer-only",
            required: true,
            options: [
              { value: "answer-only", label: "Answer in the thread only" },
              {
                value: "answer-and-fix",
                label:
                  "Answer, and open a pull request when asked to change something",
              },
            ],
          },
        },
      },
      prompt:
        "Poll {{form.repository}} for recent issue and pull request comments containing '{{form.triggerPhrase}}' and respond to each.\n\n1. List recent comments and find the ones containing the phrase. If the repository is not accessible, stop and say exactly that.\n2. Skip any comment you have already replied to — check for an existing reply from this automation in the same thread first. Never answer the same comment twice.\n3. Read the surrounding context properly: the whole issue or pull request, and the code it refers to. Answer the question that was actually asked.\n4. Apply the scope {{form.responseScope}}. With 'answer-only' never modify the repository, even if asked to. With 'answer-and-fix', when the comment asks for a change, make it on a branch, run the relevant tests, and open a pull request linked from your reply.\n5. Reply in the same thread. If you are not confident, say what you would need to be sure instead of guessing. Never merge a pull request.\n\nIf there are no new mentions, end the run stating that. That is a successful run.\n\n" +
        HONESTY_RULE +
        " " +
        PR_BODY_RULE +
        " " +
        branchNamingRule("mention-responder"),
    },
  },
];

/**
 * The locally-owned entries shown in the Proven group ahead of the published
 * featured set. Kept next to the entries themselves so adding one is a
 * single-file change.
 */
export const LOCAL_FEATURED_AUTOMATION_IDS: readonly string[] = [
  "neodevex-proactive-engineering",
  "neodevex-continuous-agent",
  "neodevex-github-issue-fixer",
  "neodevex-dependency-updater",
];

/**
 * Which published entry each local entry replaces, keyed by the local id.
 *
 * The published entries stay in the setup registry — the package pins contract
 * fixtures against their ids, and resolving one must keep working — but they
 * are dropped from the catalog the cards render from, so a user is never
 * offered both the chat-only original and its working replacement.
 */
export const SUPERSEDES_PUBLISHED_ID: Readonly<Record<string, string>> = {
  "neodevex-jira-issue-to-pr": "jira-issue-to-pr",
  "neodevex-linear-triage": "linear-triage-assistant",
  "neodevex-slack-channel-monitor": "slack-channel-monitor",
  "neodevex-slack-standup-digest": "slack-standup-digest",
  "neodevex-research-brief": "research-brief-writer",
  "neodevex-incident-retrospective": "incident-retrospective-drafter",
  "neodevex-mention-responder": "github-repo-monitor",
};

/**
 * Default `timeout` (seconds) for a local automation, keyed by id.
 *
 * The generic setup-form schema has no field type for a timeout, so none of
 * these entries can express one through `form.args` -- `buildCreatePayload`
 * in `automation-setup.ts` never emits a `timeout` key at all, meaning every
 * automation silently runs at whatever the service defaults to (600s / 10
 * min). That is too short for a real clone -> fix -> test -> PR cycle, so
 * this is host-derived data consulted directly by `buildCreatePayload` for
 * entries whose id appears here; a published entry without an override keeps
 * relying on the service default, unchanged.
 *
 * Values are sized to the realistic shape of the task, with the schedule of
 * every entry in this file spaced to leave a comfortable margin above its own
 * timeout -- see the schedule table in each entry's `cronTrigger` call. An
 * entry not listed here does no repository cloning or test running and is
 * fine on the service default.
 */
export const DEFAULT_TIMEOUT_SECONDS_BY_ID: Readonly<Record<string, number>> = {
  "neodevex-github-issue-fixer": 1200,
  "neodevex-continuous-agent": 1200,
  "neodevex-jira-issue-to-pr": 1200,
  "neodevex-mention-responder": 1200,
  "neodevex-dependency-updater": 1500,
  "neodevex-ci-failure-fixer": 1500,
  "neodevex-proactive-engineering": 1500,
  "neodevex-research-brief": 900,
  "neodevex-incident-retrospective": 900,
};
