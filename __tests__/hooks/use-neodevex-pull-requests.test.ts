import { describe, expect, it } from "vitest";
import {
  automationLabelFromBranch,
  automationSlugFromBranch,
} from "#/hooks/query/use-neodevex-pull-requests";
import { LOCAL_AUTOMATION_CATALOG } from "#/manifests/local-automation-catalog";

describe("automationSlugFromBranch", () => {
  it("extracts the slug from a well-formed neodevex branch", () => {
    expect(
      automationSlugFromBranch("neodevex/github-issue-fixer/issue-17-fix"),
    ).toBe("github-issue-fixer");
  });

  it("returns null for a branch that doesn't follow the convention", () => {
    expect(automationSlugFromBranch("fix-thing")).toBeNull();
    expect(automationSlugFromBranch("main")).toBeNull();
    // Missing the trailing description segment.
    expect(automationSlugFromBranch("neodevex/github-issue-fixer")).toBeNull();
  });
});

describe("automationLabelFromBranch", () => {
  it("resolves every local catalog automation's own branch prefix to its display name", () => {
    // Every entry's prompt names its branches with its own id-derived slug —
    // this is the exact correlation the Pull Requests page depends on.
    LOCAL_AUTOMATION_CATALOG.forEach((entry) => {
      const slug = entry.id.replace(/^neodevex-/, "");
      expect(
        automationLabelFromBranch(`neodevex/${slug}/some-change`),
        `${entry.id}`,
      ).toBe(entry.name);
    });
  });

  it("resolves the two non-catalog automations that name their own branches", () => {
    expect(automationLabelFromBranch("neodevex/proactivation/fix-a")).toContain(
      "Proactive Engineering",
    );
    expect(
      automationLabelFromBranch("neodevex/jira-instant-trigger/PAY-123"),
    ).toContain("Jira Issue to PR");
  });

  it("falls back to the raw slug for an unrecognized automation", () => {
    expect(automationLabelFromBranch("neodevex/some-future-thing/x")).toBe(
      "some-future-thing",
    );
  });

  it("reports 'Unknown automation' for a branch with no neodevex prefix", () => {
    expect(automationLabelFromBranch("main")).toBe("Unknown automation");
  });
});
