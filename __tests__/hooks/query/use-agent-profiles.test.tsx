import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useAgentProfiles,
  AGENT_PROFILES_QUERY_KEYS,
} from "#/hooks/query/use-agent-profiles";
import AgentProfilesService from "#/api/agent-profiles-service/agent-profiles-service.api";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import type { Backend } from "#/api/backend-registry/types";

vi.mock("#/api/agent-profiles-service/agent-profiles-service.api");

const localBackend: Backend = {
  id: "local-1",
  name: "Local 1",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    );
  };
}

describe("useAgentProfiles — active backend identity", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    __resetActiveStoreForTests();
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id, orgId: null });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(AgentProfilesService.listProfiles).mockResolvedValue({
      profiles: [],
      active_agent_profile_id: null,
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
    __resetActiveStoreForTests();
  });

  it("includes connectionRevision in the query key for cache isolation", async () => {
    const { result } = renderHook(() => useAgentProfiles(), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const queries = queryClient.getQueryCache().findAll({
      queryKey: AGENT_PROFILES_QUERY_KEYS.all,
    });
    expect(queries).toHaveLength(1);
    expect(queries[0].queryKey).toEqual([
      ...AGENT_PROFILES_QUERY_KEYS.all,
      localBackend.id,
      null,
      0, // connectionRevision
    ]);
  });

  it("refetches when the active backend's host/apiKey change in place, same backend.id", async () => {
    const { result } = renderHook(() => useAgentProfiles(), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(AgentProfilesService.listProfiles).toHaveBeenCalledTimes(1);

    // Same backend.id/orgId — only the connection details changed, as
    // updateBackend() does when a user edits a registered backend's host or
    // rotates its API key in place (bumps connectionRevision).
    act(() => {
      setRegisteredBackends([
        {
          ...localBackend,
          host: "http://localhost:9999",
          apiKey: "rotated-key",
          connectionRevision: 1,
        },
      ]);
    });

    await waitFor(() => {
      expect(AgentProfilesService.listProfiles).toHaveBeenCalledTimes(2);
    });
  });
});
