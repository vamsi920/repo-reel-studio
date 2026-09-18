import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillsModal } from "#/components/features/conversation-panel/skills-modal";
import type { SkillInfo } from "#/types/settings";

const { useConversationSkillsMock } = vi.hoisted(() => ({
  useConversationSkillsMock: vi.fn(),
}));

vi.mock("#/hooks/query/use-conversation-skills", () => ({
  useConversationSkills: () => useConversationSkillsMock(),
}));

vi.mock("react-i18next", async () => {
  const actual = await vi.importActual("react-i18next");
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const translations: Record<string, string> = {
          SKILLS_MODAL$SECTION_PROJECT: "Project",
          SKILLS_MODAL$SECTION_USER: "Personal",
          SKILLS_MODAL$SECTION_PUBLIC: "Public",
        };
        return translations[key] || key;
      },
      i18n: { changeLanguage: () => new Promise(() => {}) },
    }),
  };
});

const buildSkill = (
  overrides: Partial<SkillInfo> & Pick<SkillInfo, "name" | "source">,
): SkillInfo => ({
  type: "agentskills",
  description: null,
  triggers: [],
  content: "Skill body",
  ...overrides,
});

describe("SkillsModal", () => {
  it("expands only the clicked skill when the same skill name exists in two scopes", async () => {
    // A project-scoped skill can share a name with a personal/public one it
    // overrides — groupSkillsByScope is explicitly built to show both side
    // by side, so the expand/collapse state must not be shared between them.
    const skills: SkillInfo[] = [
      buildSkill({ name: "code-review", source: "project" }),
      buildSkill({ name: "code-review", source: "user" }),
    ];
    useConversationSkillsMock.mockReturnValue({
      data: skills,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isRefetching: false,
    });

    const user = userEvent.setup();
    render(<SkillsModal onClose={vi.fn()} />);

    const projectSection = screen.getByText("Project").closest("section")!;
    const personalSection = screen.getByText("Personal").closest("section")!;

    const projectToggle = within(projectSection).getByText("code-review");
    const personalToggle = within(personalSection).getByText("code-review");

    // Nothing expanded yet.
    expect(screen.queryAllByText("Skill body")).toHaveLength(0);

    await user.click(projectToggle);

    // Only the Project scope's card expanded — the Personal one with the
    // same skill name must stay collapsed.
    expect(within(projectSection).getByText("Skill body")).toBeInTheDocument();
    expect(
      within(personalSection).queryByText("Skill body"),
    ).not.toBeInTheDocument();

    await user.click(personalToggle);

    // Expanding the Personal card must not collapse the still-open Project
    // one — each scope's card toggles independently.
    expect(within(projectSection).getByText("Skill body")).toBeInTheDocument();
    expect(
      within(personalSection).getByText("Skill body"),
    ).toBeInTheDocument();
  });
});
