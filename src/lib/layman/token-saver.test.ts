import { describe, expect, it } from "vitest";
import {
  compactSkillDescription,
  SKILL_INDEX_DESCRIPTION_MAX,
} from "./token-saver";

describe("compactSkillDescription", () => {
  it("keeps what the skill does and when to use it, without examples", () => {
    const compact = compactSkillDescription(
      "Add an external skill from a GitHub repository to the current workspace. Handles fetching the skill files and placing them in .agents/skills/. Use when users want to import, install, or add a skill from a GitHub URL (e.g., `/add-skill https://github.com/OpenHands/extensions`).",
    );

    expect(compact).toContain("Add an external skill from a GitHub repository");
    expect(compact).toContain("Use when");
    expect(compact).not.toContain("e.g.");
    expect(compact.length).toBeLessThanOrEqual(SKILL_INDEX_DESCRIPTION_MAX + 1);
  });

  it("leaves file names, paths and short descriptions untouched", () => {
    expect(
      compactSkillDescription(
        "Persist and retrieve repository-specific knowledge using AGENTS.md files. Use when you want to save important information about a codebase (build commands, code style, workflows) for future sessions.",
      ),
    ).toContain("AGENTS.md");
    expect(compactSkillDescription("Bitbucket integration hub.")).toBe(
      "Bitbucket integration hub.",
    );
  });
});
