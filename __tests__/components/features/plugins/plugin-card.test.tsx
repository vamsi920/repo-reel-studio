import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PluginCard } from "#/components/features/plugins/plugin-card";
import type { PluginViewModel } from "#/components/features/plugins/build-plugins-view-model";

function buildPlugin(
  overrides: Partial<PluginViewModel> = {},
): PluginViewModel {
  return {
    name: "weather",
    description: "Weather lookup plugin",
    source: "github:acme/weather",
    ref: null,
    repoPath: null,
    installed: false,
    enabled: false,
    version: null,
    inCatalog: true,
    isLocal: false,
    path: null,
    skills: null,
    files: null,
    ...overrides,
  };
}

describe("PluginCard", () => {
  it("opens the detail view when the card itself is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <PluginCard
        plugin={buildPlugin()}
        onOpen={onOpen}
        onInstall={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("plugin-card-weather"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens the detail view on Enter/Space when the card itself has focus", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <PluginCard
        plugin={buildPlugin()}
        onOpen={onOpen}
        onInstall={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    const card = screen.getByTestId("plugin-card-weather");
    card.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("installs without opening the detail view when not yet installed", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onInstall = vi.fn();
    render(
      <PluginCard
        plugin={buildPlugin()}
        onOpen={onOpen}
        onInstall={onInstall}
        onToggle={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("plugin-install-weather"));

    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not open the detail view when the enable toggle is used on an installed plugin", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    render(
      <PluginCard
        plugin={buildPlugin({ installed: true, enabled: true })}
        onOpen={onOpen}
        onInstall={vi.fn()}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByTestId("plugin-toggle-weather"));

    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("shows the Local badge instead of install/toggle controls for an ambient local plugin", () => {
    render(
      <PluginCard
        plugin={buildPlugin({ isLocal: true, source: null, version: "2.0.0" })}
        onOpen={vi.fn()}
        onInstall={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("plugin-local-badge-weather"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("plugin-install-weather"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("plugin-toggle-weather")).not.toBeInTheDocument();
    expect(screen.getByTestId("plugin-version-weather")).toBeInTheDocument();
  });

  it("disables the install button while busy and shows the installing label", () => {
    render(
      <PluginCard
        plugin={buildPlugin()}
        isBusy
        onOpen={vi.fn()}
        onInstall={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    const installButton = screen.getByTestId("plugin-install-weather");
    expect(installButton).toBeDisabled();
    expect(installButton).toHaveTextContent(
      "SETTINGS$PLUGINS_INSTALLING",
    );
  });
});
