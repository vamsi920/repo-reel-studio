import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nKey } from "#/i18n/declaration";
import { SkillFacetRail } from "#/components/features/skills/skill-facet-rail";
import type { SkillFacetGroup } from "#/components/features/skills/skill-filter";

function buildGroups(): SkillFacetGroup[] {
  return [
    {
      id: "category",
      labelKey: I18nKey.SETTINGS$SKILLS_FACET_CATEGORY,
      rows: [
        {
          value: "environment",
          labelKey: I18nKey.SETTINGS$SKILLS_CATEGORY_ENVIRONMENT,
          count: 10,
          checked: false,
          disabled: false,
        },
        {
          value: "writing",
          labelKey: I18nKey.SETTINGS$SKILLS_CATEGORY_WRITING,
          count: 0,
          checked: false,
          disabled: true,
        },
      ],
    },
  ];
}

describe("SkillFacetRail", () => {
  it("renders nothing when no group is visible", () => {
    render(<SkillFacetRail groups={[]} onToggle={vi.fn()} />);
    expect(screen.queryByTestId("skill-facet-rail")).not.toBeInTheDocument();
  });

  it("renders each row with its count and checked state", () => {
    render(<SkillFacetRail groups={buildGroups()} onToggle={vi.fn()} />);

    const row = screen.getByTestId("skill-facet-category-environment");
    expect(row).toHaveAttribute("aria-checked", "false");
    expect(row).toHaveTextContent("10");
    expect(
      screen.getByTestId("skill-facet-group-category"),
    ).toBeInTheDocument();
  });

  it("reports the group and value when a row is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<SkillFacetRail groups={buildGroups()} onToggle={onToggle} />);

    await user.click(screen.getByTestId("skill-facet-category-environment"));

    expect(onToggle).toHaveBeenCalledWith("category", "environment");
  });

  it("does not report clicks on a disabled zero-count row", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<SkillFacetRail groups={buildGroups()} onToggle={onToggle} />);

    await user.click(screen.getByTestId("skill-facet-category-writing"));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("draws a checked box with the ink/canvas token pair, not literal white/black", () => {
    // The light theme remaps `--color-white` to ink, so `bg-white text-black`
    // rendered an invisible black tick on a black square.
    const [group] = buildGroups();
    group.rows[0].checked = true;
    render(<SkillFacetRail groups={[group]} onToggle={vi.fn()} />);

    const row = screen.getByTestId("skill-facet-category-environment");
    expect(row).toHaveAttribute("aria-checked", "true");
    const box = row.querySelector("span[aria-hidden]");
    expect(box).toHaveClass("bg-foreground", "text-[var(--oh-background)]");
    expect(box).not.toHaveClass("bg-white", "text-black");
  });
});
