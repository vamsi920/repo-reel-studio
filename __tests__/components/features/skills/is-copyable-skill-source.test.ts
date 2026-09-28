import { describe, expect, it } from "vitest";
import { isCopyableSkillSource } from "#/components/features/skills/is-copyable-skill-source";

describe("isCopyableSkillSource", () => {
  it("returns false for scope labels and empty values", () => {
    expect(isCopyableSkillSource(null)).toBe(false);
    expect(isCopyableSkillSource("")).toBe(false);
    expect(isCopyableSkillSource("global")).toBe(false);
    expect(isCopyableSkillSource("agent")).toBe(false);
  });

  it("returns true for filesystem paths and URLs", () => {
    expect(isCopyableSkillSource("/skills/deno/SKILL.md")).toBe(true);
    expect(isCopyableSkillSource(".agents/skills/foo/SKILL.md")).toBe(true);
    expect(
      isCopyableSkillSource("https://github.com/example/skills"),
    ).toBe(true);
  });

  it("returns true for relative and home-relative paths", () => {
    expect(isCopyableSkillSource("./skills/foo/SKILL.md")).toBe(true);
    expect(isCopyableSkillSource("../skills/foo/SKILL.md")).toBe(true);
    expect(isCopyableSkillSource("~/.agents/skills/foo/SKILL.md")).toBe(true);
  });

  it("returns true for Windows drive-letter paths", () => {
    expect(isCopyableSkillSource("C:\\skills\\foo\\SKILL.md")).toBe(true);
    expect(isCopyableSkillSource("D:/skills/foo/SKILL.md")).toBe(true);
  });

  it("returns false for undefined and values with no path/URL shape", () => {
    expect(isCopyableSkillSource(undefined)).toBe(false);
    expect(isCopyableSkillSource("personal")).toBe(false);
  });
});
