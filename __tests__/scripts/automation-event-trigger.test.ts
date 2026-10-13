// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildGitHubEventTrigger,
  parseGitHubEventTrigger,
  scopeTriggerToRepo,
} from "../../scripts/automation-event-trigger.mjs";

describe("buildGitHubEventTrigger", () => {
  it.each([
    [
      "issue_comment",
      "/bench",
      "issue_comment.created",
      "repository.full_name == 'acme/app' && (icontains(comment.body, '/bench'))",
    ],
    [
      "pr_opened",
      "release/",
      "pull_request.opened",
      "repository.full_name == 'acme/app' && (starts_with(pull_request.head.ref, 'release/'))",
    ],
    [
      "push",
      "main",
      "push",
      "repository.full_name == 'acme/app' && (ref == 'refs/heads/main')",
    ],
  ] as const)(
    "builds a %s trigger scoped to its repository",
    (event, match, on, filter) => {
      expect(
        buildGitHubEventTrigger(event, "https://github.com/acme/app", match),
      ).toEqual({
        type: "event",
        source: "github",
        on,
        filter,
      });
    },
  );

  it("sends failed CI to the github-ci source and escapes quotes in conditions", () => {
    const trigger = buildGitHubEventTrigger("ci_failed", "acme/app", "it's");

    expect(trigger.source).toBe("github-ci");
    expect(trigger.on).toBe("workflow_run.failure");
    expect(trigger.filter).toBe(
      "repository.full_name == 'acme/app' && (starts_with(workflow_run.head_branch, 'it\\'s'))",
    );
  });

  it("rejects a repository that is not on GitHub", () => {
    expect(() =>
      buildGitHubEventTrigger("issue_opened", "https://gitlab.com/acme/app"),
    ).toThrow(/Not a GitHub repository/);
  });
});

describe("scopeTriggerToRepo", () => {
  const repos = { repos: [{ url: "https://github.com/acme/app" }] };

  // The service matched events by type and filter only, so this automation
  // also fired for /bench comments in every other watched repository.
  it("adds the repository to an unscoped GitHub trigger, keeping its filter", () => {
    const scoped = scopeTriggerToRepo({
      trigger: {
        type: "event",
        source: "github",
        on: "issue_comment.created",
        filter: "icontains(comment.body, '/bench')",
      },
      preset_metadata: repos,
    });

    expect(scoped?.filter).toBe(
      "repository.full_name == 'acme/app' && (icontains(comment.body, '/bench'))",
    );
    expect(
      scopeTriggerToRepo({ trigger: scoped, preset_metadata: repos }),
    ).toBeNull();
  });

  it.each([
    ["a cron trigger", { trigger: { type: "cron" }, preset_metadata: repos }],
    [
      "a Jira trigger",
      { trigger: { type: "event", source: "jira" }, preset_metadata: repos },
    ],
    [
      "an automation with two repositories",
      {
        trigger: { type: "event", source: "github", on: "push" },
        preset_metadata: {
          repos: [{ url: "acme/app" }, { url: "acme/web" }],
        },
      },
    ],
  ])("leaves %s unchanged", (_label, automation) => {
    expect(scopeTriggerToRepo(automation)).toBeNull();
  });
});

describe("parseGitHubEventTrigger", () => {
  it.each([
    ["issue_opened", ""],
    ["issue_comment", "/neo"],
    ["pr_opened", "release/"],
    ["push", "main"],
    ["ci_failed", "it's"],
  ] as const)("round-trips a %s trigger built by the app", (event, match) => {
    const trigger = buildGitHubEventTrigger(event, "acme/app", match);

    expect(parseGitHubEventTrigger(trigger)).toEqual({
      event,
      repo: "acme/app",
      match,
    });
  });

  it("returns null for a hand-written filter it cannot show as a simple condition", () => {
    expect(
      parseGitHubEventTrigger({
        type: "event",
        source: "github",
        on: "issue_comment.created",
        filter:
          "repository.full_name == 'acme/app' && (contains(comment.body, 'x') || sender.login == 'bot')",
      }),
    ).toBeNull();
  });
});
