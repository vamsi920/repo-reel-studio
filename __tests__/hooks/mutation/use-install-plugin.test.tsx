import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PluginsManagementService, {
  type InstalledPluginInfo,
} from "#/api/plugins-management-service";
import { SEEDED_DEFAULT_BACKEND_ID } from "#/api/backend-registry/default-backend";
import { useInstallPlugin } from "#/hooks/mutation/use-install-plugin";
import { SKILLS_QUERY_KEYS } from "#/hooks/query/query-keys";

const createWrapper = (
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) => {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  }
  return Wrapper;
};

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

describe("useInstallPlugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("installs a plugin from the given coordinates in one request", async () => {
    const installSpy = vi
      .spyOn(PluginsManagementService, "installPlugin")
      .mockResolvedValue(buildInstalledPlugin());
    const { result } = renderHook(() => useInstallPlugin(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      source: "github:OpenHands/extensions",
      ref: null,
      repo_path: "plugins/demo-plugin",
    });

    expect(installSpy).toHaveBeenCalledOnce();
    expect(installSpy).toHaveBeenCalledWith({
      source: "github:OpenHands/extensions",
      ref: null,
      repo_path: "plugins/demo-plugin",
    });
  });

  // Regression test: a newly-installed plugin can bundle skills that
  // auto-load once enabled. Without invalidating the skills catalog, the
  // Skills page could serve up to 10 minutes of stale data (`useSkills`'s
  // `staleTime`) and appear to be missing the plugin's skills.
  it("invalidates the skills catalog on success so newly-bundled skills show up", async () => {
    vi.spyOn(PluginsManagementService, "installPlugin").mockResolvedValue(
      buildInstalledPlugin(),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useInstallPlugin(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      source: "github:OpenHands/extensions",
      ref: null,
      repo_path: "plugins/demo-plugin",
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: SKILLS_QUERY_KEYS.all(SEEDED_DEFAULT_BACKEND_ID),
      }),
    );
  });

  // Regression test: the mutation's own `onError` already toasts the
  // failure. Without `meta.disableToast`, the global MutationCache handler
  // in query-client-config.ts would toast the exact same message a second
  // time, stacking two identical toasts for one failed install.
  it("disables the global mutation-error toast so its own onError doesn't stack a duplicate", async () => {
    vi.spyOn(PluginsManagementService, "installPlugin").mockRejectedValue(
      new Error("boom"),
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const { result } = renderHook(() => useInstallPlugin(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ source: "github:OpenHands/extensions" }),
    ).rejects.toThrow("boom");

    await waitFor(() => {
      const [mutation] = queryClient.getMutationCache().getAll();
      expect(mutation.options.meta).toEqual({ disableToast: true });
    });
  });
});
