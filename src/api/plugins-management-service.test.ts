import { PluginsClient } from "@openhands/typescript-client/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import PluginsManagementService from "#/api/plugins-management-service";

vi.mock("@openhands/typescript-client/clients", () => ({
  PluginsClient: vi.fn(),
}));

const listInstalledPlugins = vi.fn();
const installPlugin = vi.fn();
const setPluginEnabled = vi.fn();
const uninstallPlugin = vi.fn();
const refreshPlugin = vi.fn();
const close = vi.fn();

/** Mirrors the SDK `HttpError` shape: `name === "HttpError"` + numeric status. */
function sdkHttpError(status: number) {
  const error = new Error(`HTTP request failed (${status} ): {}`) as Error & {
    status: number;
  };
  error.name = "HttpError";
  error.status = status;
  return error;
}

function useBackend(kind: "local" | "cloud"): void {
  const backend: Backend = {
    id: kind,
    name: kind,
    host: "http://127.0.0.1:8001",
    apiKey: "session-key",
    kind,
  };
  setRegisteredBackends([backend]);
  setActiveSelection({ backendId: kind, orgId: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetActiveStoreForTests();
  vi.mocked(PluginsClient).mockImplementation(function MockPluginsClient() {
    return {
      listInstalledPlugins,
      installPlugin,
      setPluginEnabled,
      uninstallPlugin,
      refreshPlugin,
      close,
    } as unknown as PluginsClient;
  } as unknown as typeof PluginsClient);
});

afterEach(() => {
  __resetActiveStoreForTests();
});

const installedPlugin = {
  name: "demo-plugin",
  version: "1.0.0",
  description: "A demo plugin",
  enabled: true,
  source: "github:OpenHands/extensions",
  resolved_ref: null,
  repo_path: "plugins/demo-plugin",
  installed_at: "2026-06-01T00:00:00Z",
  install_path: "/home/.openhands/plugins/installed/demo-plugin",
};

describe("PluginsManagementService", () => {
  it("lists installed plugins from the local agent-server", async () => {
    useBackend("local");
    listInstalledPlugins.mockResolvedValue({ plugins: [installedPlugin] });

    const result = await PluginsManagementService.listInstalledPlugins();

    expect(result).toEqual([installedPlugin]);
    expect(listInstalledPlugins).toHaveBeenCalledTimes(1);
  });

  it("returns an empty installed list on a cloud backend without calling the client", async () => {
    useBackend("cloud");

    const result = await PluginsManagementService.listInstalledPlugins();

    expect(result).toEqual([]);
    expect(PluginsClient).not.toHaveBeenCalled();
  });

  it("returns an empty installed list when the agent-server has no plugins router (404)", async () => {
    useBackend("local");
    listInstalledPlugins.mockRejectedValue(sdkHttpError(404));

    const result = await PluginsManagementService.listInstalledPlugins();

    expect(result).toEqual([]);
  });

  it("rethrows a 5xx instead of reporting an empty installed list", async () => {
    useBackend("local");
    const error = sdkHttpError(500);
    listInstalledPlugins.mockRejectedValue(error);

    await expect(PluginsManagementService.listInstalledPlugins()).rejects.toBe(
      error,
    );
  });

  it("rethrows a transport failure", async () => {
    useBackend("local");
    const error = new Error("Request failed: Failed to fetch");
    listInstalledPlugins.mockRejectedValue(error);

    await expect(PluginsManagementService.listInstalledPlugins()).rejects.toBe(
      error,
    );
  });

  it("forwards source, ref, and repo_path when installing a plugin", async () => {
    useBackend("local");
    installPlugin.mockResolvedValue(installedPlugin);

    await PluginsManagementService.installPlugin({
      source: "github:OpenHands/extensions",
      ref: "main",
      repo_path: "plugins/demo-plugin",
    });

    expect(installPlugin).toHaveBeenCalledWith({
      source: "github:OpenHands/extensions",
      ref: "main",
      repo_path: "plugins/demo-plugin",
    });
  });

  it("forwards the name and enabled flag when toggling a plugin", async () => {
    useBackend("local");
    setPluginEnabled.mockResolvedValue({ name: "demo-plugin", enabled: false });

    await PluginsManagementService.setPluginEnabled("demo-plugin", false);

    expect(setPluginEnabled).toHaveBeenCalledWith("demo-plugin", false);
  });

  it("forwards the plugin name when uninstalling", async () => {
    useBackend("local");
    uninstallPlugin.mockResolvedValue({ message: "ok" });

    await PluginsManagementService.uninstallPlugin("demo-plugin");

    expect(uninstallPlugin).toHaveBeenCalledWith("demo-plugin");
  });

  it("forwards the plugin name when refreshing", async () => {
    useBackend("local");
    refreshPlugin.mockResolvedValue({ message: "ok", plugin: installedPlugin });

    await PluginsManagementService.refreshPlugin("demo-plugin");

    expect(refreshPlugin).toHaveBeenCalledWith("demo-plugin");
  });
});
