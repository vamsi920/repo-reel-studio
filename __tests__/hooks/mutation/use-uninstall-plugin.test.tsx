import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PluginsManagementService from "#/api/plugins-management-service";
import { useUninstallPlugin } from "#/hooks/mutation/use-uninstall-plugin";

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
