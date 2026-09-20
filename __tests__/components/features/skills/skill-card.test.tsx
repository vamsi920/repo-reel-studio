import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillCard } from "#/components/features/skills/skill-card";
import type { SkillInfo } from "#/types/settings";

function stubClipboard(clipboard: Clipboard | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
    writable: true,
  });
}

function buildSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "deno",
    type: "knowledge",
    source: "/skills/deno/SKILL.md",
    description: "Deno runtime helper",
    triggers: ["deno"],
    version: "1.0.0",
    is_agentskills_format: true,
    disable_model_invocation: false,
    ...overrides,
  };
}

describe("SkillCard", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
    vi.restoreAllMocks();
  });

  it("opens the detail view when the card itself is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <SkillCard
        skill={buildSkill()}
        enabled
        onOpen={onOpen}
        onToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("skill-card-deno"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens the detail view on Enter/Space when the card itself has focus", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <SkillCard
        skill={buildSkill()}
        enabled
        onOpen={onOpen}
        onToggle={vi.fn()}
      />,
    );

    const card = screen.getByTestId("skill-card-deno");
    card.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("does not open the detail view when the enable toggle is used", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    render(
      <SkillCard
        skill={buildSkill()}
        enabled
        onOpen={onOpen}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByTestId("skill-toggle-deno"));

    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("copies a copyable source without opening the detail view", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText } as unknown as Clipboard);
    const onOpen = vi.fn();

    render(
      <SkillCard
        skill={buildSkill()}
        enabled
        onOpen={onOpen}
        onToggle={vi.fn()}
      />,
    );

    const copyButton = screen.getByTestId("skill-copy-source-deno");
    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith("/skills/deno/SKILL.md");
    expect(onOpen).not.toHaveBeenCalled();
    expect(copyButton).toBeDisabled();
  });

  it("hides the copy-source button for a non-copyable (scope-label) source", () => {
    render(
      <SkillCard
        skill={buildSkill({ source: "global" })}
        enabled
        onOpen={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("skill-copy-source-deno"),
    ).not.toBeInTheDocument();
  });

  it("renders the description and pills when present", () => {
    render(
      <SkillCard
        skill={buildSkill()}
        enabled
        onOpen={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByTestId("skill-description-deno")).toHaveTextContent(
      "Deno runtime helper",
    );
    expect(screen.getByTestId("skill-triggers-deno")).toBeInTheDocument();
  });
});
