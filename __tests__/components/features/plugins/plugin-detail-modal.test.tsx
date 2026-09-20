import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PluginDetailModal } from "#/components/features/plugins/plugin-detail-modal";
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

describe("PluginDetailModal", () => {
  it("shows Install for an uninstalled plugin and reports the click", async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();

    render(
      <PluginDetailModal
        plugin={buildPlugin()}
        onToggle={vi.fn()}
        onInstall={onInstall}
        onUninstall={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("plugin-detail-install-weather"));
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId(`plugin-modal-toggle-weather`),
    ).not.toBeInTheDocument();
  });

  it("shows the enable toggle, Refresh and Uninstall for an installed plugin", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onUninstall = vi.fn();
    const onRefresh = vi.fn();

    render(
      <PluginDetailModal
        plugin={buildPlugin({ installed: true, enabled: true })}
        onToggle={onToggle}
        onInstall={vi.fn()}
        onUninstall={onUninstall}
        onRefresh={onRefresh}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("plugin-detail-install-weather"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("plugin-modal-toggle-weather"));
    expect(onToggle).toHaveBeenCalledWith(false);

    await user.click(screen.getByTestId("plugin-detail-refresh-weather"));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("plugin-detail-uninstall-weather"));
    expect(onUninstall).toHaveBeenCalledTimes(1);
  });

  it("hides install/uninstall controls entirely for an ambient local plugin", () => {
    render(
      <PluginDetailModal
        plugin={buildPlugin({ isLocal: true })}
        onToggle={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("plugin-detail-install-weather"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("plugin-detail-uninstall-weather"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("plugin-detail-modal")).toBeInTheDocument();
  });

  it("disables every action while busy", () => {
    render(
      <PluginDetailModal
        plugin={buildPlugin({ installed: true, enabled: true })}
        isBusy
        onToggle={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("plugin-modal-toggle-weather")).toBeDisabled();
    expect(screen.getByTestId("plugin-detail-refresh-weather")).toBeDisabled();
    expect(
      screen.getByTestId("plugin-detail-uninstall-weather"),
    ).toBeDisabled();
  });

  it("renders bundled skills and calls onClose from the Close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <PluginDetailModal
        plugin={buildPlugin({
          installed: true,
          skills: [
            { name: "forecast", description: "Get the forecast" },
            { name: "alerts", description: null },
          ],
        })}
        onToggle={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onRefresh={vi.fn()}
        onClose={onClose}
      />,
    );

    const forecastRow = screen.getByTestId("plugin-bundled-skill-forecast");
    expect(within(forecastRow).getByText("forecast")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-bundled-skill-alerts")).toBeInTheDocument();

    await user.click(screen.getByTestId("plugin-detail-modal-dismiss"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows Start conversation only when a handler is given and the plugin has a source", () => {
    const { rerender } = render(
      <PluginDetailModal
        plugin={buildPlugin()}
        onToggle={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("plugin-detail-start-conversation-weather"),
    ).not.toBeInTheDocument();

    rerender(
      <PluginDetailModal
        plugin={buildPlugin()}
        onToggle={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        onRefresh={vi.fn()}
        onClose={vi.fn()}
        onStartConversation={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("plugin-detail-start-conversation-weather"),
    ).toBeInTheDocument();
  });
});
