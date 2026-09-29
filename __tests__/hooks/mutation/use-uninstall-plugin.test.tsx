import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PluginsManagementService from "#/api/plugins-management-service";
import { SEEDED_DEFAULT_BACKEND_ID } from "#/api/backend-registry/default-backend";
import { useUninstallPlugin } from "#/hooks/mutation/use-uninstall-plugin";
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

describe("useUninstallPlugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uninstalls a plugin by name in one request", async () => {
    const uninstallSpy = vi
      .spyOn(PluginsManagementService, "uninstallPlugin")
      .mockResolvedValue({ message: "ok" });
    const { result } = renderHook(() => useUninstallPlugin(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync("demo-plugin");

    expect(uninstallSpy).toHaveBeenCalledOnce();
    expect(uninstallSpy).toHaveBeenCalledWith("demo-plugin");
  });

  // Regression test: an uninstalled plugin's bundled skills stop auto-loading,
  // so the skills catalog must be invalidated too — otherwise the Skills page
  // could keep showing them for up to 10 minutes (`useSkills`'s `staleTime`).
  it("invalidates the skills catalog on success so removed skills stop showing up", async () => {
    vi.spyOn(PluginsManagementService, "uninstallPlugin").mockResolvedValue({
      message: "ok",
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUninstallPlugin(), {
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
  // time, stacking two identical toasts for one failed uninstall.
  it("disables the global mutation-error toast so its own onError doesn't stack a duplicate", async () => {
    vi.spyOn(PluginsManagementService, "uninstallPlugin").mockRejectedValue(
      new Error("boom"),
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const { result } = renderHook(() => useUninstallPlugin(), {
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
});
