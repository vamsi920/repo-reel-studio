import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nKey } from "#/i18n/declaration";
import {
  getSkillTypeLabelKey,
  SkillTypeBadge,
} from "#/components/features/skills/skill-type-badge";
import type { SkillType } from "#/types/settings";

describe("getSkillTypeLabelKey", () => {
  it.each<[SkillType, I18nKey]>([
    ["agentskills", I18nKey.SETTINGS$SKILLS_TYPE_AGENTSKILLS],
    ["knowledge", I18nKey.SETTINGS$SKILLS_TYPE_KNOWLEDGE],
    ["repo", I18nKey.SETTINGS$SKILLS_TYPE_REPO],
  ])("maps %s to its label key", (type, expected) => {
    expect(getSkillTypeLabelKey(type)).toBe(expected);
  });
});

describe("SkillTypeBadge", () => {
  it.each<[SkillType, I18nKey]>([
    ["agentskills", I18nKey.SETTINGS$SKILLS_TYPE_AGENTSKILLS],
    ["knowledge", I18nKey.SETTINGS$SKILLS_TYPE_KNOWLEDGE],
    ["repo", I18nKey.SETTINGS$SKILLS_TYPE_REPO],
  ])("renders the translated label for %s", (type, labelKey) => {
    render(<SkillTypeBadge type={type} />);

    const badge = screen.getByTestId(`skill-type-badge-${type}`);
    expect(badge).toHaveTextContent(labelKey);
  });
});
