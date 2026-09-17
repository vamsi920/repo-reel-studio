import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PluginsManagementService from "#/api/plugins-management-service";
import PluginsService from "#/api/plugins-service";
import SkillsService from "#/api/skills-service";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { usePlugins } from "#/hooks/query/use-plugins";
import { useLocalPlugins } from "#/hooks/query/use-local-plugins";
import { usePluginsMarketplace } from "#/hooks/query/use-plugins-marketplace";
import { usePluginFileContent } from "#/hooks/query/use-plugin-file-content";
import { useSkills } from "#/hooks/query/use-skills";
import type { Backend } from "#/api/backend-registry/types";

const localBackendA: Backend = {
  id: "local-a",
  name: "Local A",
  host: "http://127.0.0.1:8001",
  apiKey: "",
  kind: "local",
};

const localBackendB: Backend = {
  id: "local-b",
  name: "Local B",
  host: "http://127.0.0.1:8002",
  apiKey: "",
  kind: "local",
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  __resetActiveStoreForTests();
  setRegisteredBackends([localBackendA, localBackendB]);
  setActiveSelection({ backendId: localBackendA.id });
  vi.spyOn(
    PluginsManagementService,
    "listInstalledPlugins",
  ).mockResolvedValue([]);
  vi.spyOn(PluginsService, "getLocalPlugins").mockResolvedValue([]);
  vi.spyOn(PluginsService, "getPluginsMarketplace").mockResolvedValue([]);
  vi.spyOn(PluginsService, "getPluginFileContent").mockResolvedValue({
    kind: "text",
    text: "",
  });
  vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  __resetActiveStoreForTests();
});

describe("plugins/skills query hooks — backend switch", () => {
  it("usePlugins refetches instead of serving another backend's cached installed list", async () => {
    const { result } = renderHook(() => usePlugins(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(PluginsManagementService.listInstalledPlugins).toHaveBeenCalledTimes(
      1,
    );

    setActiveSelection({ backendId: localBackendB.id });

    await waitFor(() => {
      expect(
        PluginsManagementService.listInstalledPlugins,
      ).toHaveBeenCalledTimes(2);
    });
  });

  it("useLocalPlugins refetches on a backend switch", async () => {
    const { result } = renderHook(() => useLocalPlugins(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(PluginsService.getLocalPlugins).toHaveBeenCalledTimes(1);

    setActiveSelection({ backendId: localBackendB.id });

    await waitFor(() => {
      expect(PluginsService.getLocalPlugins).toHaveBeenCalledTimes(2);
    });
  });

  it("usePluginsMarketplace refetches on a backend switch", async () => {
    const { result } = renderHook(() => usePluginsMarketplace(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(PluginsService.getPluginsMarketplace).toHaveBeenCalledTimes(1);

    setActiveSelection({ backendId: localBackendB.id });

    await waitFor(() => {
      expect(PluginsService.getPluginsMarketplace).toHaveBeenCalledTimes(2);
    });
  });

  it("usePluginFileContent refetches on a backend switch", async () => {
    const { result } = renderHook(
      () => usePluginFileContent("/plugins/demo", "README.md"),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(PluginsService.getPluginFileContent).toHaveBeenCalledTimes(1);

    setActiveSelection({ backendId: localBackendB.id });

    await waitFor(() => {
      expect(PluginsService.getPluginFileContent).toHaveBeenCalledTimes(2);
    });
  });

  it("useSkills refetches instead of serving another backend's cached skill list", async () => {
    const { result } = renderHook(() => useSkills(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(SkillsService.getSkills).toHaveBeenCalledTimes(1);

    setActiveSelection({ backendId: localBackendB.id });

    await waitFor(() => {
      expect(SkillsService.getSkills).toHaveBeenCalledTimes(2);
    });
  });
});
