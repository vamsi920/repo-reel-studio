import { describe, expect, it } from "vitest";
import type { SkillInfo } from "#/types/settings";
import { getSkillScope, groupSkillsByScope } from "#/utils/skill-scope";

function buildSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "test-skill",
    type: "knowledge",
    source: null,
    ...overrides,
  };
}

describe("getSkillScope", () => {
  it("classifies public catalog skills", () => {
    expect(
      getSkillScope(
        buildSkill({
          source: "/Users/test/.openhands/cache/skills/public-skills/skills/deno/SKILL.md",
        }),
      ),
    ).toBe("public");
    expect(getSkillScope(buildSkill({ source: "public" }))).toBe("public");
  });

  it("classifies personal user skills from home directories", () => {
    expect(
      getSkillScope(
        buildSkill({
          source: "/Users/test/.agents/skills/my-skill/SKILL.md",
        }),
      ),
    ).toBe("personal");
    expect(getSkillScope(buildSkill({ source: "user" }))).toBe("personal");
  });

  it("classifies project skills from the workspace", () => {
    const projectDir = "/workspace/project/agent-canvas";
    expect(
      getSkillScope(
        buildSkill({
          source: `${projectDir}/.agents/skills/default-tools/SKILL.md`,
        }),
        projectDir,
      ),
    ).toBe("project");
    expect(getSkillScope(buildSkill({ source: "project" }))).toBe("project");
  });

  it("does not classify a different project's skill path as this project's", () => {
    // A marker path (`.agents/skills/`, `.openhands/skills/`) that lives
    // under some OTHER project directory is not this conversation's own
    // project skill just because it shares the marker -- it must not be
    // silently bucketed under "project" once a project dir is actually known.
    const projectDir = "/workspace/project/agent-canvas";
    expect(
      getSkillScope(
        buildSkill({
          source: "/workspace/some-other-repo/.agents/skills/foo/SKILL.md",
        }),
        projectDir,
      ),
    ).toBe("public");
  });

  it("still classifies a marker path as project when no project dir is known to compare against", () => {
    // With no projectDir to rule anything out (e.g. the global Skills page,
    // which fetches without a workspace scope), the prior "assume project"
    // fallback still applies.
    expect(
      getSkillScope(
        buildSkill({
          source: "/workspace/some-repo/.agents/skills/foo/SKILL.md",
        }),
      ),
    ).toBe("project");
  });
});

describe("groupSkillsByScope", () => {
  it("groups and sorts skills by scope", () => {
    const grouped = groupSkillsByScope([
      buildSkill({ name: "beta", source: "public" }),
      buildSkill({ name: "alpha", source: "user" }),
      buildSkill({
        name: "gamma",
        source: "/workspace/project/.agents/skills/gamma/SKILL.md",
      }),
    ], "/workspace/project");

    expect(grouped.public.map((skill) => skill.name)).toEqual(["beta"]);
    expect(grouped.personal.map((skill) => skill.name)).toEqual(["alpha"]);
    expect(grouped.project.map((skill) => skill.name)).toEqual(["gamma"]);
  });
});
