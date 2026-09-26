import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import PluginsService, { type MarketplacePlugin } from "#/api/plugins-service";
import type { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";
import { PluginPicker } from "#/components/features/plugins/plugin-picker";

// The catalog hook's service constructs a typescript-client `PluginsClient` at
// module load; stub it so importing the service never touches the real client.
// Every test replaces `getPluginsMarketplace` itself, so the client is unused.
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
const beta: MarketplacePlugin = {
  name: "beta",
  description: "second plugin",
  source: "github:o/b",
  ref: null,
  repo_path: null,
  installed: true,
};
const alphaSpec: PluginSpec = {
  source: "github:o/a",
  ref: null,
  repo_path: "plugins/alpha",
};

function renderPicker(selected: PluginSpec[] = []) {
  const onChange = vi.fn();
  renderWithProviders(<PluginPicker selected={selected} onChange={onChange} />);
  return { onChange };
}

describe("PluginPicker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a selectable card for each catalog plugin", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      alpha,
      beta,
    ]);

    renderPicker();

    expect(
      await screen.findByTestId("plugin-picker-card-alpha"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("plugin-picker-card-beta")).toBeInTheDocument();
  });

  it("reports the mapped PluginSpec when an unselected plugin is toggled on", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      alpha,
    ]);
    const { onChange } = renderPicker([]);

    await userEvent.click(
      await screen.findByTestId("plugin-picker-toggle-alpha"),
    );

    expect(onChange).toHaveBeenCalledWith([alphaSpec]);
  });

  it("removes a plugin from the selection when toggled off", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      alpha,
    ]);
    const { onChange } = renderPicker([alphaSpec]);

    await userEvent.click(
      await screen.findByTestId("plugin-picker-toggle-alpha"),
    );

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows the empty state when the catalog is empty", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([]);

    renderPicker();

    expect(
      await screen.findByTestId("plugin-picker-empty"),
    ).toBeInTheDocument();
  });

  it("shows a no-results message, not the empty-catalog message, when a search matches nothing", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      alpha,
      beta,
    ]);

    renderPicker();
    await screen.findByTestId("plugin-picker-card-alpha");
    await userEvent.type(
      screen.getByTestId("plugin-picker-search-input"),
      "nonexistent-plugin",
    );

    expect(
      await screen.findByTestId("plugin-picker-no-results"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("plugin-picker-empty"),
    ).not.toBeInTheDocument();
  });

  it("shows the error state when the catalog fails to load", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockRejectedValue(
      new Error("unreachable"),
    );

    renderPicker();

    const error = await screen.findByTestId("plugin-picker-error");
    expect(error).toBeInTheDocument();
    expect(error).toHaveAttribute("role", "alert");
  });

  it("announces the loading state to assistive tech", async () => {
    let resolveMarketplace: (plugins: MarketplacePlugin[]) => void = () => {};
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockReturnValue(
      new Promise((resolve) => {
        resolveMarketplace = resolve;
      }),
    );

    renderPicker();

    const loading = await screen.findByTestId("plugin-picker-loading");
    expect(loading).toHaveAttribute("role", "status");
    expect(loading).toHaveAttribute("aria-live", "polite");

    resolveMarketplace([]);
    await screen.findByTestId("plugin-picker-empty");
  });

  it("refetches the catalog when the error state's retry button is clicked", async () => {
    const getPluginsMarketplace = vi
      .spyOn(PluginsService, "getPluginsMarketplace")
      .mockRejectedValueOnce(new Error("unreachable"))
      .mockResolvedValueOnce([alpha]);

    renderPicker();
    await screen.findByTestId("plugin-picker-error");

    await userEvent.click(
      screen.getByTestId("plugin-picker-error-retry"),
    );

    expect(
      await screen.findByTestId("plugin-picker-card-alpha"),
    ).toBeInTheDocument();
    expect(getPluginsMarketplace).toHaveBeenCalledTimes(2);
  });

  it("keeps a stable, unique key per catalog entry even when the old space-joined coordinates would have collided", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // Space-joining "source ref repo_path name" made these two collide
    // ("foo" + " " + "bar baz" + " " + "" + " " + "dup" === "foo bar" + " " +
    // "baz" + " " + "" + " " + "dup"), even though their coordinates differ.
    const collisionA: MarketplacePlugin = {
      name: "dup",
      description: "a",
      source: "foo",
      ref: "bar baz",
      repo_path: null,
      installed: false,
    };
    const collisionB: MarketplacePlugin = {
      name: "dup",
      description: "b",
      source: "foo bar",
      ref: "baz",
      repo_path: null,
      installed: false,
    };
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      collisionA,
      collisionB,
    ]);

    renderPicker();

    expect(await screen.findAllByTestId("plugin-picker-card-dup")).toHaveLength(
      2,
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("same key"),
      expect.anything(),
    );
  });

  it("filters the catalog by the search query", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      alpha,
      beta,
    ]);

    renderPicker();
    await screen.findByTestId("plugin-picker-card-alpha");
    await userEvent.type(
      screen.getByTestId("plugin-picker-search-input"),
      "alpha",
    );

    expect(screen.getByTestId("plugin-picker-card-alpha")).toBeInTheDocument();
    expect(
      screen.queryByTestId("plugin-picker-card-beta"),
    ).not.toBeInTheDocument();
  });
});
