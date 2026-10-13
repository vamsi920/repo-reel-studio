// @vitest-environment node
import { describe, expect, it } from "vitest";
import { automationTargets } from "../../scripts/bug-fixer-webhook-server.mjs";

describe("bug fixer webhook server matching", () => {
  // The service keeps repositories in preset_metadata.repos; matching on a
  // top-level `repository` (filled in client-side only) never found one.
  const automation = {
    trigger: {
      filter: "(issue.fields.project.key || fields.project.key) == 'PROJ'",
    },
    preset_metadata: { repos: [{ url: "https://github.com/acme/app" }] },
  };

  it.each([
    ["github", "acme/app", true],
    ["github", "https://github.com/acme/app.git", true],
    ["github", "acme/other", false],
    ["jira", "PROJ", true],
    ["jira", "OTHER", false],
  ])("%s %s -> %s", (source, key, expected) => {
    expect(automationTargets(automation, source, key)).toBe(expected);
  });
});
