import { describe, expect, it } from "vitest";
import {
  buildProactivationPrompt,
  getWatchAreaLabel,
  isProactivationAutomation,
  parseProactivationMarker,
  PROACTIVATION_NAME_PREFIX,
} from "./proactivation-prompt";

describe("buildProactivationPrompt", () => {
  it("embeds a parseable marker with the chosen config", () => {
    const prompt = buildProactivationPrompt({
      watchAreas: ["dependency", "test"],
      autonomyLevel: "prepare-fix",
      repository: "acme/payments-api",
    });

    const config = parseProactivationMarker(prompt);
    expect(config).toEqual({
      version: 1,
      watchAreas: ["dependency", "test"],
      autonomyLevel: "prepare-fix",
      repository: "acme/payments-api",
    });
  });

  it("includes guidance only for the selected watch areas", () => {
    const prompt = buildProactivationPrompt({
      watchAreas: ["documentation"],
      autonomyLevel: "recommend",
      repository: "acme/docs",
    });

    expect(prompt).toContain("Documentation: stale docs");
    expect(prompt).not.toContain("Dependencies: outdated packages");
    expect(prompt).not.toContain("Tests: failing tests");
  });

  it("forbids file changes for the recommend autonomy level", () => {
    const prompt = buildProactivationPrompt({
      watchAreas: ["code-quality"],
      autonomyLevel: "recommend",
      repository: "acme/repo",
    });

    expect(prompt).toContain("Do NOT modify any files");
  });

  it("forbids pushing/PR-ing for the prepare-fix autonomy level", () => {
    const prompt = buildProactivationPrompt({
      watchAreas: ["code-quality"],
      autonomyLevel: "prepare-fix",
      repository: "acme/repo",
    });

    expect(prompt).toContain(
      "Do NOT push the branch and do NOT open a pull request",
    );
  });

  it("authorizes pushing and opening a PR for create-pr, but never merging", () => {
    const prompt = buildProactivationPrompt({
      watchAreas: ["code-quality"],
      autonomyLevel: "create-pr",
      repository: "acme/repo",
    });

    expect(prompt).toContain("push the branch and open a pull request");
    expect(prompt).toContain("Never merge the pull request yourself");
  });

  it("instructs the agent to check workspace memory and avoid duplicate work", () => {
    const prompt = buildProactivationPrompt({
      watchAreas: ["dependency"],
      autonomyLevel: "recommend",
      repository: "acme/repo",
    });

    expect(prompt).toContain(".neodevex/memory");
    expect(prompt).toContain("gh pr list");
  });

  it("never hardcodes a quota of findings", () => {
    const prompt = buildProactivationPrompt({
      watchAreas: ["dependency"],
      autonomyLevel: "recommend",
      repository: "acme/repo",
    });

    expect(prompt).toContain("No meaningful improvements found");
    expect(prompt).not.toMatch(/\bfind\s+\d+\b/i);
  });
});

describe("parseProactivationMarker", () => {
  it("returns null for a plain automation prompt", () => {
    expect(
      parseProactivationMarker("Please review open PRs daily."),
    ).toBeNull();
  });

  it("returns null for null/undefined/empty input", () => {
    expect(parseProactivationMarker(null)).toBeNull();
    expect(parseProactivationMarker(undefined)).toBeNull();
    expect(parseProactivationMarker("")).toBeNull();
  });

  it("returns null for malformed marker JSON", () => {
    expect(
      parseProactivationMarker("<!-- neodevex:proactivation {not json} -->"),
    ).toBeNull();
  });

  it("round-trips through isProactivationAutomation", () => {
    const prompt = buildProactivationPrompt({
      watchAreas: ["ci"],
      autonomyLevel: "create-pr",
      repository: "acme/repo",
    });
    expect(isProactivationAutomation(prompt)).toBe(true);
    expect(isProactivationAutomation("some other automation prompt")).toBe(
      false,
    );
  });
});

describe("getWatchAreaLabel", () => {
  it("returns a human label for every watch area", () => {
    expect(getWatchAreaLabel("dependency")).toBe("Dependencies");
    expect(getWatchAreaLabel("code-quality")).toBe("Code Quality");
    expect(getWatchAreaLabel("repository-health")).toBe("Repository Health");
  });
});

describe("PROACTIVATION_NAME_PREFIX", () => {
  it("is a stable, non-empty prefix", () => {
    expect(PROACTIVATION_NAME_PREFIX.length).toBeGreaterThan(0);
  });
});
