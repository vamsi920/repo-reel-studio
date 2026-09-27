import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import SettingsService from "#/api/settings-service/settings-service.api";

const trackMcpConfigUpdatedMock = vi.fn();
vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackMcpConfigUpdated: trackMcpConfigUpdatedMock,
  }),
}));

const useSettingsMock = vi.fn();
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));

import { useSaveSettings } from "#/hooks/mutation/use-save-settings";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe("useSaveSettings - MCP tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
    // Default: no current mcp_config so any incoming config is treated as new.
    useSettingsMock.mockReturnValue({ data: {} });
  });

  it("calls trackMcpConfigUpdated with server counts when mcp_config changes", async () => {
    const { result } = renderHook(() => useSaveSettings(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      mcp_config: {
        sse1: { transport: "sse", url: "http://sse1" },
        sse2: { transport: "sse", url: "http://sse2" },
        stdio1: { transport: "stdio", command: "cmd", args: [] },
        http1: { transport: "http", url: "http://http1" },
        streamable1: { transport: "streamable-http", url: "http://streamable1" },
      },
    });

    await waitFor(() => {
      expect(trackMcpConfigUpdatedMock).toHaveBeenCalledWith({
        sseServersCount: 2,
        stdioServersCount: 1,
        httpServersCount: 2,
      });
    });
  });

  it("does not call trackMcpConfigUpdated when mcp_config is absent in the update", async () => {
    const { result } = renderHook(() => useSaveSettings(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ user_consents_to_analytics: true });

    expect(trackMcpConfigUpdatedMock).not.toHaveBeenCalled();
  });

  it("does not call trackMcpConfigUpdated when mcp_config reference is unchanged", async () => {
    const sharedConfig = {};
    useSettingsMock.mockReturnValue({
      data: { mcp_config: sharedConfig },
    });

    const { result } = renderHook(() => useSaveSettings(), {
      wrapper: createWrapper(),
    });

    // Passing the same object reference — should not trigger tracking.
    await result.current.mutateAsync({ mcp_config: sharedConfig });

    expect(trackMcpConfigUpdatedMock).not.toHaveBeenCalled();
  });

  it("does not call trackMcpConfigUpdated when mcp_config content is unchanged but the object is a fresh reference", async () => {
    // Regression: a caller that spreads/rebuilds the current mcp_config into
    // a new object (same content, different reference) must not spuriously
    // fire analytics -- only a real content change should.
    useSettingsMock.mockReturnValue({
      data: {
        mcp_config: { stdio1: { transport: "stdio", command: "cmd", args: [] } },
      },
    });

    const { result } = renderHook(() => useSaveSettings(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      mcp_config: { stdio1: { transport: "stdio", command: "cmd", args: [] } },
    });

    expect(trackMcpConfigUpdatedMock).not.toHaveBeenCalled();
  });

  it("counts zero servers correctly when server arrays are empty", async () => {
    const { result } = renderHook(() => useSaveSettings(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      mcp_config: {},
    });

    await waitFor(() => {
      expect(trackMcpConfigUpdatedMock).toHaveBeenCalledWith({
        sseServersCount: 0,
        stdioServersCount: 0,
        httpServersCount: 0,
      });
    });
  });
});
