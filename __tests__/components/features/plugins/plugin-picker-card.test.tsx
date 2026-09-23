import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PluginPickerCard } from "#/components/features/plugins/plugin-picker-card";
import type { MarketplacePlugin } from "#/api/plugins-service";

function buildPlugin(
  overrides: Partial<MarketplacePlugin> = {},
): MarketplacePlugin {
  return {
    name: "weather",
    description: "Weather lookup plugin",
    source: "github:acme/weather",
    ref: null,
    repo_path: null,
    installed: false,
    ...overrides,
  };
}

describe("PluginPickerCard", () => {
  it("renders the plugin's name, source, and description", () => {
    render(
      <PluginPickerCard
        plugin={buildPlugin()}
        isSelected={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByTestId("plugin-picker-name-weather")).toHaveTextContent(
      "weather",
    );
    expect(screen.getByText("github:acme/weather")).toBeInTheDocument();
    expect(screen.getByText("Weather lookup plugin")).toBeInTheDocument();
  });

  it("shows repo_path and ref pills when present", () => {
    render(
      <PluginPickerCard
        plugin={buildPlugin({ repo_path: "plugins/weather", ref: "v2" })}
        isSelected={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("plugins/weather")).toBeInTheDocument();
    expect(screen.getByText("@v2")).toBeInTheDocument();
  });

  it("omits the coordinate pills when neither repo_path nor ref is set", () => {
    render(
      <PluginPickerCard
        plugin={buildPlugin()}
        isSelected={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
  });

  it("reflects the selected state on the toggle", () => {
    render(
      <PluginPickerCard
        plugin={buildPlugin()}
        isSelected
        onToggle={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("plugin-picker-toggle-weather"),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("reports the next selection state when toggled", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <PluginPickerCard
        plugin={buildPlugin()}
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByTestId("plugin-picker-toggle-weather"));

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("disables the toggle when isDisabled is set", () => {
    render(
      <PluginPickerCard
        plugin={buildPlugin()}
        isSelected={false}
        isDisabled
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByTestId("plugin-picker-toggle-weather")).toBeDisabled();
  });
});
