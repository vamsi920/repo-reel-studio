import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import PluginsService, { type MarketplacePlugin } from "#/api/plugins-service";
import type { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";
import { PluginPickerModal } from "#/components/features/plugins/plugin-picker-modal";

// The catalog hook's service constructs a typescript-client `PluginsClient` at
// module load; stub it so importing the service never touches the real client.
vi.mock("@openhands/typescript-client/clients", () => ({
  PluginsClient: vi.fn(),
}));

const alpha: MarketplacePlugin = {
  name: "alpha",
  description: "first plugin",
  source: "github:o/a",
  ref: null,
  repo_path: "plugins/alpha",
  installed: false,
};
const alphaSpec: PluginSpec = {
  source: "github:o/a",
  ref: null,
  repo_path: "plugins/alpha",
};

function renderModal(selected: PluginSpec[] = []) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <PluginPickerModal
      selected={selected}
      onChange={onChange}
      onClose={onClose}
    />,
  );
  return { onChange, onClose };
}

describe("PluginPickerModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("embeds the plugin picker showing the caller's current selection", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      alpha,
    ]);

    renderModal([alphaSpec]);

    expect(
      await screen.findByTestId("plugin-picker-card-alpha"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plugin-picker-toggle-alpha"),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("closes on Done without discarding the caller's selection", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      alpha,
    ]);
    const { onChange, onClose } = renderModal([alphaSpec]);
    await screen.findByTestId("plugin-picker-card-alpha");

    await user.click(screen.getByTestId("plugin-picker-done"));

    expect(onClose).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes when the header close button is clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([]);
    const { onClose } = renderModal();
    await screen.findByTestId("plugin-picker-empty");

    await user.click(screen.getByTestId("plugin-picker-close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("reports a toggle from inside the embedded picker", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      alpha,
    ]);
    const { onChange } = renderModal([]);

    await user.click(
      await screen.findByTestId("plugin-picker-toggle-alpha"),
    );

    expect(onChange).toHaveBeenCalledWith([alphaSpec]);
  });
});
