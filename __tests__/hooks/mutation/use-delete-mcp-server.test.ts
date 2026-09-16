import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import {
  __resetMcpHealthStoreForTests,
  getMcpHealthSnapshot,
  setMcpServerHealth,
} from "#/api/mcp-health/mcp-health-store";
import { useDeleteMcpServer } from "#/hooks/mutation/use-delete-mcp-server";
import { SETTINGS_QUERY_KEYS } from "#/hooks/query/query-keys";
import type { MCPServerConfig } from "#/types/mcp-server";
import { getMcpServerHealthKey } from "#/utils/mcp-server-health-key";

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

describe("useDeleteMcpServer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetMcpHealthStoreForTests();
  });

  it("deletes by stable map key in one request", async () => {
    const deleteSpy = vi
      .spyOn(SettingsService, "deleteMcpServer")
      .mockResolvedValue(true);
    const fetchSpy = vi.spyOn(SettingsService, "fetchSettingsFromApi");
    const target: MCPServerConfig = {
      id: "github",
      type: "shttp",
      name: "github",
      url: "https://github.example/mcp",
    };
    const { result } = renderHook(() => useDeleteMcpServer(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync(target);

    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(deleteSpy).toHaveBeenCalledWith("github");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("drops the deleted server's health verdict after success", async () => {
    vi.spyOn(SettingsService, "deleteMcpServer").mockResolvedValue(true);
    const target: MCPServerConfig = {
      id: "github",
      type: "shttp",
      name: "github",
      url: "https://github.example/mcp",
    };
    const key = getMcpServerHealthKey(target);
    setMcpServerHealth(key, {
      status: "healthy",
      verification: "verified",
      toolCount: 1,
      checkedAt: 1,
    });
    const { result } = renderHook(() => useDeleteMcpServer(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync(target);

    await waitFor(() => expect(getMcpHealthSnapshot()[key]).toBeUndefined());
  });

  it("treats a 404 as already deleted: drops health and refetches settings", async () => {
    const notFound = new AxiosError(
      "Request failed with status code 404",
      "ERR_BAD_REQUEST",
      { headers: new AxiosHeaders() },
      undefined,
      {
        status: 404,
        statusText: "Not Found",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { detail: "MCP server 'github' was not found" },
      },
    );
    vi.spyOn(SettingsService, "deleteMcpServer").mockRejectedValue(notFound);
    const invalidateCacheSpy = vi.spyOn(SettingsService, "invalidateCache");
    const target: MCPServerConfig = {
      id: "github",
      type: "shttp",
      name: "github",
      url: "https://github.example/mcp",
    };
    const key = getMcpServerHealthKey(target);
    setMcpServerHealth(key, {
      status: "healthy",
      verification: "verified",
      toolCount: 1,
      checkedAt: 1,
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteMcpServer(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync(target)).rejects.toBe(notFound);

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: SETTINGS_QUERY_KEYS.personal(),
      }),
    );
    expect(invalidateCacheSpy).toHaveBeenCalled();
    expect(getMcpHealthSnapshot()[key]).toBeUndefined();
    const [mutation] = queryClient.getMutationCache().getAll();
    expect(mutation.options.meta).toEqual({ disableToast: true });
  });

  it("does not refetch settings on a non-404 failure", async () => {
    vi.spyOn(SettingsService, "deleteMcpServer").mockRejectedValue(
      new Error("boom"),
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteMcpServer(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        id: "github",
        type: "shttp",
        name: "github",
        url: "https://github.example/mcp",
      }),
    ).rejects.toThrow("boom");

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
