import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PluginsManagementService, {
  type InstalledPluginInfo,
} from "#/api/plugins-management-service";
import { SEEDED_DEFAULT_BACKEND_ID } from "#/api/backend-registry/default-backend";
import { useRefreshPlugin } from "#/hooks/mutation/use-refresh-plugin";
import { SKILLS_QUERY_KEYS } from "#/hooks/query/query-keys";

const mockDisplayErrorToast = vi.fn();

vi.mock("#/utils/custom-toast-handlers", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/utils/custom-toast-handlers")>();
  return {
    ...actual,
    displayErrorToast: (...args: unknown[]) => mockDisplayErrorToast(...args),
  };
});

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

describe("useRefreshPlugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes a plugin by name in one request", async () => {
    const refreshSpy = vi
      .spyOn(PluginsManagementService, "refreshPlugin")
      .mockResolvedValue({
        message: "ok",
        plugin: buildInstalledPlugin(),
      });
    const { result } = renderHook(() => useRefreshPlugin(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync("demo-plugin");

    expect(refreshSpy).toHaveBeenCalledOnce();
    expect(refreshSpy).toHaveBeenCalledWith("demo-plugin");
  });

  // Regression test: a refresh can add, remove, or change a plugin's bundled
  // skills, so the skills catalog must be invalidated too — otherwise the
  // Skills page could serve up to 10 minutes of stale data (`useSkills`'s
  // `staleTime`).
  it("invalidates the skills catalog on success", async () => {
    vi.spyOn(PluginsManagementService, "refreshPlugin").mockResolvedValue({
      message: "ok",
      plugin: buildInstalledPlugin(),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRefreshPlugin(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync("demo-plugin");

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: SKILLS_QUERY_KEYS.all(SEEDED_DEFAULT_BACKEND_ID),
      }),
    );
  });

  // Regression test: the mutation's own `onError` already toasts the
  // failure. Without `meta.disableToast`, the global MutationCache handler
  // in query-client-config.ts would toast the exact same message a second
  // time, stacking two identical toasts for one failed refresh.
  it("disables the global mutation-error toast so its own onError doesn't stack a duplicate", async () => {
    vi.spyOn(PluginsManagementService, "refreshPlugin").mockRejectedValue(
      new Error("boom"),
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const { result } = renderHook(() => useRefreshPlugin(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync("demo-plugin")).rejects.toThrow(
      "boom",
    );

    await waitFor(() => {
      const [mutation] = queryClient.getMutationCache().getAll();
      expect(mutation.options.meta).toEqual({ disableToast: true });
    });
  });

  // Regression test: without forwarding the original error, displayErrorToast
  // cannot tell a real backend response (which may legitimately contain text
  // like "Failed to fetch plugin source") from an actual network/CORS
  // failure, and would rewrite the real backend message into a misleading
  // "Disconnected (check URL or network)" toast.
  it("passes the original error to displayErrorToast so a real backend message isn't misclassified as a network failure", async () => {
    const backendError = new Error("Failed to fetch plugin source: 404");
    vi.spyOn(PluginsManagementService, "refreshPlugin").mockRejectedValue(
      backendError,
    );
    const { result } = renderHook(() => useRefreshPlugin(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync("demo-plugin")).rejects.toThrow();

    await waitFor(() => {
      expect(mockDisplayErrorToast).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ error: backendError }),
      );
    });
  });
});
