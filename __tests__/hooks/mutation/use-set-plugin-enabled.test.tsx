import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PluginsManagementService from "#/api/plugins-management-service";
import { useSetPluginEnabled } from "#/hooks/mutation/use-set-plugin-enabled";

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

describe("useSetPluginEnabled", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("toggles a plugin's enabled state in one request", async () => {
    const toggleSpy = vi
      .spyOn(PluginsManagementService, "setPluginEnabled")
      .mockResolvedValue({ name: "demo-plugin", enabled: false });
    const { result } = renderHook(() => useSetPluginEnabled(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ name: "demo-plugin", enabled: false });

    expect(toggleSpy).toHaveBeenCalledOnce();
    expect(toggleSpy).toHaveBeenCalledWith("demo-plugin", false);
  });

  // Regression test: the mutation's own `onError` already toasts the
  // failure. Without `meta.disableToast`, the global MutationCache handler
  // in query-client-config.ts would toast the exact same message a second
  // time, stacking two identical toasts for one failed toggle.
  it("disables the global mutation-error toast so its own onError doesn't stack a duplicate", async () => {
    vi.spyOn(PluginsManagementService, "setPluginEnabled").mockRejectedValue(
      new Error("boom"),
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const { result } = renderHook(() => useSetPluginEnabled(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ name: "demo-plugin", enabled: false }),
    ).rejects.toThrow("boom");

    await waitFor(() => {
      const [mutation] = queryClient.getMutationCache().getAll();
      expect(mutation.options.meta).toEqual({ disableToast: true });
    });
  });
});
