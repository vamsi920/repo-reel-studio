import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkillIconBadge } from "#/components/features/skills/skill-icon-badge";

describe("SkillIconBadge", () => {
  it("renders a hidden badge keyed and titled by the skill name", () => {
    render(<SkillIconBadge skillName="deno" />);

    const badge = screen.getByTestId("skill-icon-deno");
    expect(badge).toHaveAttribute("title", "deno");
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });

  it("merges a caller-supplied className with its own classes", () => {
    render(<SkillIconBadge skillName="deno" className="custom-class" />);

    expect(screen.getByTestId("skill-icon-deno")).toHaveClass(
      "custom-class",
      "rounded-lg",
    );
  });

  it("keys each badge by its own skill name", () => {
    render(
      <>
        <SkillIconBadge skillName="deno" />
        <SkillIconBadge skillName="git" />
      </>,
    );

    expect(screen.getByTestId("skill-icon-deno")).toBeInTheDocument();
    expect(screen.getByTestId("skill-icon-git")).toBeInTheDocument();
  });
});
