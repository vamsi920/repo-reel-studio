import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PluginPickerTrigger } from "#/components/features/plugins/plugin-picker-trigger";

describe("PluginPickerTrigger", () => {
  it("renders the selected-count badge with the ink/canvas token pair", () => {
    render(<PluginPickerTrigger count={2} onClick={vi.fn()} />);

    const badge = screen.getByTestId("plugin-picker-count");
    expect(badge).toHaveTextContent("2");
    // Same fix as the skills toolbar badge: literal white/black turns
    // black-on-black under the light theme's `--color-white` remap.
    expect(badge).toHaveClass("bg-foreground", "text-[var(--oh-background)]");
    expect(badge).not.toHaveClass("bg-white", "text-black");
  });

  it("omits the badge when nothing is selected", () => {
    render(<PluginPickerTrigger count={0} onClick={vi.fn()} />);

    expect(screen.queryByTestId("plugin-picker-count")).not.toBeInTheDocument();
  });
});
