import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SkillCardPillRow,
  computeVisiblePillCount,
} from "#/components/features/skills/skill-card-pill-row";

// Test fixtures stand in for the real pill styling; only the row's layout
// behavior is under test here.
const TEST_PILL_CLASS = "test-pill";

describe("computeVisiblePillCount", () => {
  it("returns 0 for an empty pill list or a zero/negative container width", () => {
    expect(computeVisiblePillCount([], 200)).toBe(0);
    expect(computeVisiblePillCount([30], 0)).toBe(0);
    expect(computeVisiblePillCount([30], -10)).toBe(0);
  });

  it("shows every pill with no overflow badge when they exactly fill the container", () => {
    // 3 pills of 30px + 2 gaps of 6px = 102px exactly. A reservation-loop
    // regression that always sets aside overflow-badge width even when
    // nothing needs to overflow would incorrectly hide pills here.
    expect(computeVisiblePillCount([30, 30, 30], 102)).toBe(3);
  });

  it("shows every pill when they fit with room to spare", () => {
    expect(computeVisiblePillCount([30, 30, 30], 150)).toBe(3);
  });

  it("reserves overflow-badge width for every hidden pill once any pill must overflow", () => {
    // Total (138px) exceeds the container (100px), so an overflow badge is
    // required; only pills that fit alongside the reserved 46px badge width
    // stay visible.
    expect(computeVisiblePillCount([30, 30, 30, 30], 100)).toBe(1);
  });

  it("always shows at least one pill even when the first one alone overflows", () => {
    expect(computeVisiblePillCount([500, 30], 100)).toBe(1);
  });
});

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
