import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillCardPillRow } from "#/components/features/skills/skill-card-pill-row";

// Test fixtures stand in for the real pill styling; only the row's layout
// behavior is under test here.
const TEST_PILL_CLASS = "test-pill";

describe("SkillCardPillRow", () => {
  it("keeps pills on a single nowrap row with overflow handling", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}

        disconnect() {}
      },
    );

    render(
      <SkillCardPillRow
        testId="skill-triggers-test"
        pills={[
          {
            id: "type-knowledge",
            node: <span className={TEST_PILL_CLASS}>Trigger-based</span>,
          },
          {
            id: "trigger-ssh",
            node: <span className={TEST_PILL_CLASS}>ssh</span>,
          },
        ]}
      />,
    );

    const row = screen.getByTestId("skill-triggers-test");
    expect(row).toHaveClass("flex-nowrap");
    expect(row).toHaveClass("overflow-hidden");
    expect(row).not.toHaveClass("flex-wrap");
  });

  it("shows each hidden pill's label, not its internal id, in the overflow tooltip", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}

        disconnect() {}
      },
    );

    // jsdom reports 0 for offsetWidth/clientWidth, so every pill here lands
    // in the overflow badge — exercising the tooltip without needing to
    // mock layout.
    render(
      <SkillCardPillRow
        testId="skill-triggers-test"
        pills={[
          {
            id: "type-knowledge",
            label: "Knowledge",
            node: <span className={TEST_PILL_CLASS}>Knowledge</span>,
          },
          {
            id: "trigger-ssh",
            label: "ssh",
            node: <span className={TEST_PILL_CLASS}>ssh</span>,
          },
        ]}
      />,
    );

    const overflow = screen.getByTestId("skill-triggers-test-overflow");
    expect(overflow).toHaveAttribute("title", "Knowledge, ssh");
    expect(overflow.getAttribute("title")).not.toContain("type-knowledge");
    expect(overflow.getAttribute("title")).not.toContain("trigger-ssh");
  });

  it("omits the tooltip entirely when no hidden pill carries a label", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}

        disconnect() {}
      },
    );

    render(
      <SkillCardPillRow
        testId="skill-triggers-test"
        pills={[
          {
            id: "repository",
            node: <span className={TEST_PILL_CLASS}>my-repo</span>,
          },
        ]}
      />,
    );

    expect(
      screen.getByTestId("skill-triggers-test-overflow"),
    ).not.toHaveAttribute("title");
  });
});
