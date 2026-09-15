import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillsToolbar } from "#/components/features/skills/skills-toolbar";

function renderToolbar(activeFilterCount: number) {
  render(
    <SkillsToolbar
      search=""
      onSearchChange={vi.fn()}
      activeFilterCount={activeFilterCount}
      onOpenFilters={vi.fn()}
    />,
  );
}

describe("SkillsToolbar", () => {
  it("hides the active-filter badge when no filter is applied", () => {
    renderToolbar(0);

    expect(
      screen.queryByTestId("skills-filters-count"),
    ).not.toBeInTheDocument();
  });

  it("renders a readable active-filter badge with the ink/canvas token pair", () => {
    renderToolbar(1);

    const badge = screen.getByTestId("skills-filters-count");
    expect(badge).toHaveTextContent("1");
    // Literal white/black collapsed to black-on-black once the light theme
    // remapped `--color-white` to ink; the token pair inverts together.
    expect(badge).toHaveClass("bg-foreground", "text-[var(--oh-background)]");
    expect(badge).not.toHaveClass("bg-white", "text-black");
  });
});
