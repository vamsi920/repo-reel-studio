import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsPluginsScreen from "#/routes/skills-plugins";
import SettingsService from "#/api/settings-service/settings-service.api";
import PluginsService, { type MarketplacePlugin } from "#/api/plugins-service";
import PluginsManagementService, {
  type InstalledPluginInfo,
} from "#/api/plugins-management-service";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { buildPluginLaunchPath } from "#/utils/plugin-launch-url";

const navigateMock = vi.fn();

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({
    navigate: navigateMock,
    currentPath: "/plugins",
    conversationId: null,
    isNavigating: false,
  }),
  NavigationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const localBackend: Backend = {
  id: "local",
  name: "Local",
  host: "http://127.0.0.1:8001",
  apiKey: "",
  kind: "local",
};

function buildCatalogPlugin(
  overrides: Partial<MarketplacePlugin> = {},
): MarketplacePlugin {
  return {
    name: "demo-plugin",
    description: "A demo plugin",
    source: "github:OpenHands/extensions",
    ref: null,
    repo_path: "plugins/demo-plugin",
    installed: false,
    ...overrides,
  };
}

function buildInstalledPlugin(
  overrides: Partial<InstalledPluginInfo> = {},
): InstalledPluginInfo {
  return {
    name: "demo-plugin",
    version: "1.0.0",
    description: "A demo plugin",
    enabled: true,
    source: "github:OpenHands/extensions",
    resolved_ref: null,
    repo_path: "plugins/demo-plugin",
    installed_at: "2026-06-01T00:00:00Z",
    install_path: "/home/.openhands/plugins/installed/demo-plugin",
    ...overrides,
  };
}

function renderPluginsScreen() {
  return render(<SkillsPluginsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    ),
  });
}

describe("SkillsPluginsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockReset();
    __resetActiveStoreForTests();
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      MOCK_DEFAULT_USER_SETTINGS,
    );
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([]);
    vi.spyOn(PluginsService, "getLocalPlugins").mockResolvedValue([]);
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([]);
  });

  it("announces the loading skeleton to assistive tech", async () => {
    let resolveMarketplace: (plugins: MarketplacePlugin[]) => void = () => {};
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockReturnValue(
      new Promise((resolve) => {
        resolveMarketplace = resolve;
      }),
    );

    renderPluginsScreen();

    const loading = await screen.findByTestId("plugins-loading");
    expect(loading).toHaveAttribute("role", "status");
    expect(loading).toHaveAttribute("aria-live", "polite");
    expect(loading).toHaveTextContent("HOME$LOADING");

    resolveMarketplace([]);
    await waitFor(() =>
      expect(screen.queryByTestId("plugins-loading")).not.toBeInTheDocument(),
    );
  });

  it("renders an Install action for a catalog plugin that is not installed", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin(),
    ]);

    renderPluginsScreen();

    expect(
      await screen.findByTestId("plugin-install-demo-plugin"),
    ).toBeInTheDocument();
  });

  it("renders an enable/disable toggle reflecting state for an installed plugin", async () => {
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([buildInstalledPlugin({ enabled: true })]);

    renderPluginsScreen();

    const toggle = await screen.findByTestId("plugin-toggle-demo-plugin");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    // The accessible name must say "plugin", not the toggle's default "skill".
    expect(toggle).toHaveAccessibleName("SETTINGS$PLUGINS_DISABLE_PLUGIN");
  });

  it("names a disabled plugin's toggle as enabling a plugin", async () => {
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([buildInstalledPlugin({ enabled: false })]);

    renderPluginsScreen();

    const toggle = await screen.findByTestId("plugin-toggle-demo-plugin");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleName("SETTINGS$PLUGINS_ENABLE_PLUGIN");
  });

  it("installs a catalog plugin with its coordinates when Install is clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin(),
    ]);
    const installSpy = vi
      .spyOn(PluginsManagementService, "installPlugin")
      .mockResolvedValue(buildInstalledPlugin());

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-install-demo-plugin"));

    await waitFor(() =>
      expect(installSpy).toHaveBeenCalledWith({
        source: "github:OpenHands/extensions",
        ref: null,
        repo_path: "plugins/demo-plugin",
      }),
    );
  });

  it("toggles an installed plugin off via the card toggle", async () => {
    const user = userEvent.setup();
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([buildInstalledPlugin({ enabled: true })]);
    const toggleSpy = vi
      .spyOn(PluginsManagementService, "setPluginEnabled")
      .mockResolvedValue({ name: "demo-plugin", enabled: false });

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-toggle-demo-plugin"));

    await waitFor(() =>
      expect(toggleSpy).toHaveBeenCalledWith("demo-plugin", false),
    );
  });

  it("keeps a plugin's toggle busy while its own request is still in flight, even after a different plugin's toggle resolves", async () => {
    const user = userEvent.setup();
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([
      buildInstalledPlugin({ name: "plugin-a", enabled: true }),
      buildInstalledPlugin({ name: "plugin-b", enabled: true }),
    ]);

    let resolveA: (value: { name: string; enabled: boolean }) => void =
      () => {};
    const pendingA = new Promise<{ name: string; enabled: boolean }>(
      (resolve) => {
        resolveA = resolve;
      },
    );
    vi.spyOn(PluginsManagementService, "setPluginEnabled").mockImplementation(
      (name: string) =>
        name === "plugin-a"
          ? pendingA
          : Promise.resolve({ name, enabled: false }),
    );

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-toggle-plugin-a"));
    await user.click(await screen.findByTestId("plugin-toggle-plugin-b"));

    // plugin-b's own request has already resolved...
    await waitFor(() =>
      expect(screen.getByTestId("plugin-toggle-plugin-b")).not.toBeDisabled(),
    );
    // ...but plugin-a's request is still in flight, so its own toggle must
    // stay busy rather than being cleared by the shared mutation settling
    // for a different plugin.
    expect(screen.getByTestId("plugin-toggle-plugin-a")).toBeDisabled();

    resolveA({ name: "plugin-a", enabled: false });
    await waitFor(
      () =>
        expect(
          screen.getByTestId("plugin-toggle-plugin-a"),
        ).not.toBeDisabled(),
      { timeout: 5000 },
    );
  });

  it("keeps a plugin's install button busy while its own request is still in flight, even after a different plugin's install resolves", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin({ name: "plugin-a", source: "github:org/plugin-a" }),
      buildCatalogPlugin({ name: "plugin-b", source: "github:org/plugin-b" }),
    ]);

    let resolveA: (value: InstalledPluginInfo) => void = () => {};
    const pendingA = new Promise<InstalledPluginInfo>((resolve) => {
      resolveA = resolve;
    });
    vi.spyOn(PluginsManagementService, "installPlugin").mockImplementation(
      (request) =>
        request.source === "github:org/plugin-a"
          ? pendingA
          : Promise.resolve(buildInstalledPlugin({ name: "plugin-b" })),
    );

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-install-plugin-a"));
    await user.click(await screen.findByTestId("plugin-install-plugin-b"));

    // plugin-b's own request has already resolved...
    await waitFor(() =>
      expect(screen.getByTestId("plugin-install-plugin-b")).not.toBeDisabled(),
    );
    // ...but plugin-a's request is still in flight, so its own Install button
    // must stay busy rather than being cleared by the shared mutation
    // settling for a different plugin (which would let a second, concurrent
    // install fire for plugin-a while the first is still running).
    expect(screen.getByTestId("plugin-install-plugin-a")).toBeDisabled();

    resolveA(buildInstalledPlugin({ name: "plugin-a" }));
    await waitFor(
      () =>
        expect(
          screen.getByTestId("plugin-install-plugin-a"),
        ).not.toBeDisabled(),
      { timeout: 5000 },
    );
  });

  it("does not close a different plugin's detail modal when an earlier uninstall for another plugin finally resolves", async () => {
    const user = userEvent.setup();
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([
      buildInstalledPlugin({ name: "plugin-a" }),
      buildInstalledPlugin({ name: "plugin-b" }),
    ]);

    let resolveUninstallA: (value: { message: string }) => void = () => {};
    const pendingUninstallA = new Promise<{ message: string }>((resolve) => {
      resolveUninstallA = resolve;
    });
    vi.spyOn(PluginsManagementService, "uninstallPlugin").mockImplementation(
      (name: string) =>
        name === "plugin-a"
          ? pendingUninstallA
          : Promise.resolve({ message: "ok" }),
    );

    renderPluginsScreen();

    // Start uninstalling plugin-a, then close its modal before the request
    // settles.
    await user.click(await screen.findByTestId("plugin-card-plugin-a"));
    await user.click(
      await screen.findByTestId("plugin-detail-uninstall-plugin-a"),
    );
    await user.click(await screen.findByTestId("plugin-detail-modal-dismiss"));
    expect(screen.queryByTestId("plugin-detail-modal")).not.toBeInTheDocument();

    // Now open a different plugin's modal, just to look at it.
    await user.click(await screen.findByTestId("plugin-card-plugin-b"));
    expect(await screen.findByTestId("plugin-detail-modal")).toHaveAttribute(
      "data-plugin-name",
      "plugin-b",
    );

    // plugin-a's uninstall finally resolves -- it must not close whichever
    // modal happens to be open now.
    resolveUninstallA({ message: "ok" });
    await waitFor(() =>
      expect(
        PluginsManagementService.uninstallPlugin,
      ).toHaveBeenCalledWith("plugin-a"),
    );
    expect(screen.getByTestId("plugin-detail-modal")).toHaveAttribute(
      "data-plugin-name",
      "plugin-b",
    );
  });

  it("uninstalls an installed plugin from the detail modal", async () => {
    const user = userEvent.setup();
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([buildInstalledPlugin()]);
    const uninstallSpy = vi
      .spyOn(PluginsManagementService, "uninstallPlugin")
      .mockResolvedValue({ message: "ok" });

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-card-demo-plugin"));
    await user.click(
      await screen.findByTestId("plugin-detail-uninstall-demo-plugin"),
    );

    await waitFor(() =>
      expect(uninstallSpy).toHaveBeenCalledWith("demo-plugin"),
    );
  });

  it("shows the plugin's bundled skills and files in the detail modal", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin({
        path: "/cache/plugins/demo-plugin",
        skills: [{ name: "demo-plugin:review", description: "Review code" }],
        files: ["README.md"],
      }),
    ]);

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-card-demo-plugin"));

    expect(
      await screen.findByTestId("plugin-bundled-skill-demo-plugin:review"),
    ).toHaveTextContent("Review code");
    expect(screen.getByTestId("file-tree-file-README.md")).toBeInTheDocument();
  });

  it("omits the contents sections when the plugin reports none", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin(),
    ]);

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-card-demo-plugin"));

    await screen.findByTestId("plugin-detail-modal");
    expect(
      screen.queryByText("SETTINGS$PLUGINS_SKILLS_IN_BUNDLE"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("plugin-files-section"),
    ).not.toBeInTheDocument();
  });

  it("filters the list by the search query", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin({ name: "alpha-plugin" }),
      buildCatalogPlugin({ name: "beta-plugin" }),
    ]);

    renderPluginsScreen();
    await screen.findByTestId("plugin-card-alpha-plugin");

    fireEvent.change(screen.getByTestId("plugins-search-input"), {
      target: { value: "beta" },
    });

    expect(
      screen.queryByTestId("plugin-card-alpha-plugin"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("plugin-card-beta-plugin")).toBeInTheDocument();
  });

  it("shows the empty state when there are no plugins", async () => {
    renderPluginsScreen();

    expect(await screen.findByTestId("plugins-empty")).toBeInTheDocument();
  });

  it("renders a local plugin as a read-only card without install or toggle controls", async () => {
    vi.spyOn(PluginsService, "getLocalPlugins").mockResolvedValue([
      { name: "ambient-plugin", version: "1.0.0", description: "Ambient" },
    ]);

    renderPluginsScreen();

    expect(
      await screen.findByTestId("plugin-local-badge-ambient-plugin"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("plugin-install-ambient-plugin"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("plugin-toggle-ambient-plugin"),
    ).not.toBeInTheDocument();
  });

  it("shows the no-match state when the search excludes everything", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin(),
    ]);

    renderPluginsScreen();
    await screen.findByTestId("plugin-card-demo-plugin");

    fireEvent.change(screen.getByTestId("plugins-search-input"), {
      target: { value: "no-such-plugin-xyz" },
    });

    expect(screen.getByTestId("plugins-no-match")).toBeInTheDocument();
  });

  it("says nothing is installed, not 'no match', under the Installed chip with an empty search", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin(),
    ]);

    renderPluginsScreen();
    await screen.findByTestId("plugin-card-demo-plugin");

    fireEvent.click(screen.getByTestId("plugins-filter-installed"));

    expect(
      screen.getByTestId("plugins-filter-empty-installed"),
    ).toHaveTextContent("SETTINGS$PLUGINS_NO_INSTALLED");
    expect(screen.queryByTestId("plugins-no-match")).not.toBeInTheDocument();
  });

  it("describes the empty Available and Local chips instead of blaming the search", async () => {
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([buildInstalledPlugin()]);

    renderPluginsScreen();
    await screen.findByTestId("plugin-card-demo-plugin");

    fireEvent.click(screen.getByTestId("plugins-filter-available"));
    expect(
      screen.getByTestId("plugins-filter-empty-available"),
    ).toHaveTextContent("SETTINGS$PLUGINS_NO_AVAILABLE");

    fireEvent.click(screen.getByTestId("plugins-filter-local"));
    expect(screen.getByTestId("plugins-filter-empty-local")).toHaveTextContent(
      "SETTINGS$PLUGINS_NO_LOCAL",
    );
  });

  it("keeps the no-match state when a status chip and a search query both exclude everything", async () => {
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([buildInstalledPlugin()]);

    renderPluginsScreen();
    await screen.findByTestId("plugin-card-demo-plugin");

    fireEvent.click(screen.getByTestId("plugins-filter-installed"));
    fireEvent.change(screen.getByTestId("plugins-search-input"), {
      target: { value: "no-such-plugin-xyz" },
    });

    expect(screen.getByTestId("plugins-no-match")).toHaveTextContent(
      "SETTINGS$PLUGINS_NO_MATCH",
    );
    expect(
      screen.queryByTestId("plugins-filter-empty-installed"),
    ).not.toBeInTheDocument();
  });

  it("navigates to the launch flow with the plugin's coordinates when Start Conversation is clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin(),
    ]);

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-card-demo-plugin"));
    await user.click(
      await screen.findByTestId("plugin-detail-start-conversation-demo-plugin"),
    );

    expect(navigateMock).toHaveBeenCalledWith(
      buildPluginLaunchPath([
        {
          source: "github:OpenHands/extensions",
          ref: null,
          repo_path: "plugins/demo-plugin",
        },
      ]),
    );
  });

  it("reports a failed catalog fetch instead of claiming there are no plugins", async () => {
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockRejectedValue(
      new Error("catalog unavailable"),
    );

    renderPluginsScreen();

    const error = await screen.findByTestId("plugins-error");
    expect(error).toBeInTheDocument();
    expect(error).toHaveAttribute("role", "alert");
    expect(screen.queryByTestId("plugins-empty")).not.toBeInTheDocument();
  });

  it("refetches the failed source when the error state's retry button is clicked", async () => {
    const user = userEvent.setup();
    const getPluginsMarketplace = vi
      .spyOn(PluginsService, "getPluginsMarketplace")
      .mockRejectedValueOnce(new Error("catalog unavailable"))
      .mockResolvedValueOnce([buildCatalogPlugin()]);

    renderPluginsScreen();
    await screen.findByTestId("plugins-error");

    await user.click(screen.getByTestId("plugins-error-retry"));

    expect(
      await screen.findByTestId("plugin-card-demo-plugin"),
    ).toBeInTheDocument();
    expect(getPluginsMarketplace).toHaveBeenCalledTimes(2);
  });

  it("still lists the plugins it could load when another source fails", async () => {
    vi.spyOn(PluginsService, "getLocalPlugins").mockRejectedValue(
      new Error("local scan failed"),
    );
    vi.spyOn(
      PluginsManagementService,
      "listInstalledPlugins",
    ).mockResolvedValue([buildInstalledPlugin()]);

    renderPluginsScreen();

    expect(
      await screen.findByTestId("plugin-card-demo-plugin"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("plugins-error")).toBeInTheDocument();
  });

  it("does not open the detail modal when the card's install button is activated by keyboard", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([
      buildCatalogPlugin(),
    ]);
    vi.spyOn(PluginsManagementService, "installPlugin").mockResolvedValue(
      buildInstalledPlugin(),
    );

    renderPluginsScreen();
    const install = await screen.findByTestId("plugin-install-demo-plugin");
    install.focus();
    await user.keyboard("{Enter}");

    expect(screen.queryByTestId("plugin-detail-modal")).not.toBeInTheDocument();
  });

  it("omits the Start Conversation action for a local plugin without a source", async () => {
    const user = userEvent.setup();
    vi.spyOn(PluginsService, "getLocalPlugins").mockResolvedValue([
      { name: "ambient-plugin", version: "1.0.0", description: "Ambient" },
    ]);

    renderPluginsScreen();
    await user.click(await screen.findByTestId("plugin-card-ambient-plugin"));
    await screen.findByTestId("plugin-detail-modal");

    expect(
      screen.queryByTestId("plugin-detail-start-conversation-ambient-plugin"),
    ).not.toBeInTheDocument();
  });
});
