import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AgentOpsService from "#/api/agentops-service/agentops-service.api";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  AGENTOPS_QUERY_KEYS,
  useSaveAgentOpsPolicies,
} from "#/hooks/query/use-agentops";
import type { Backend } from "#/api/backend-registry/types";
import type { AgentOpsPolicies } from "#/api/agentops-service/agentops-service.types";

vi.mock("#/api/agentops-service/agentops-service.api", async () => {
  const actual = await vi.importActual<
    typeof import("#/api/agentops-service/agentops-service.api")
  >("#/api/agentops-service/agentops-service.api");
  return {
    ...actual,
    isAgentOpsSupportedBackend: () => true,
    default: {
      ...actual.default,
      savePolicies: vi.fn(),
    },
  };
});

const backendA: Backend = {
  id: "backend-a",
  name: "Backend A",
  host: "http://localhost:8000",
  apiKey: "key-a",
  kind: "local",
};

const backendB: Backend = {
  id: "backend-b",
  name: "Backend B",
  host: "http://localhost:8001",
  apiKey: "key-b",
  kind: "local",
};

const emptyPolicies: AgentOpsPolicies = { workspaces: {}, agents: {} };

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.mocked(AgentOpsService.savePolicies).mockReset();
  setRegisteredBackends([backendA, backendB]);
  setActiveSelection({ backendId: backendA.id });
});

afterEach(() => {
  __resetActiveStoreForTests();
});

describe("useSaveAgentOpsPolicies — backend switch mid-flight", () => {
  it("writes the response into the cache for the backend the request was actually sent to, not whichever backend is active when it resolves", async () => {
    // The PUT is dispatched while Backend A is active (agentops-service.api
    // resolves the host/API key at call time), but the operator switches to
    // Backend B in the sidebar before Backend A's collector responds.
    let resolveSave!: (value: AgentOpsPolicies) => void;
    vi.mocked(AgentOpsService.savePolicies).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );

    const queryClient = new QueryClient();
    const { result } = renderHook(() => useSaveAgentOpsPolicies(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.mutate(emptyPolicies);
    });

    // Switch the active backend while Backend A's save is still pending.
    act(() => {
      setActiveSelection({ backendId: backendB.id });
    });

    const saved: AgentOpsPolicies = {
      workspaces: { "acme/repo": { monthlyBudgetUsd: 50, runBudgetUsd: 10 } },
      agents: {},
    };
    await act(async () => {
      resolveSave(saved);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    expect(
      queryClient.getQueryData(AGENTOPS_QUERY_KEYS.policies(backendA.id)),
    ).toEqual(saved);
    expect(
      queryClient.getQueryData(AGENTOPS_QUERY_KEYS.policies(backendB.id)),
    ).toBeUndefined();
  });
});
