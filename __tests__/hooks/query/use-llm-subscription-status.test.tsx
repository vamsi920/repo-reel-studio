import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useOpenAISubscriptionStatus } from "#/hooks/query/use-llm-subscription-status";
import { LLM_SUBSCRIPTION_QUERY_KEYS } from "#/hooks/query/query-keys";
import LLMSubscriptionService from "#/api/llm-subscription-service";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import type { Backend } from "#/api/backend-registry/types";

vi.mock("#/api/llm-subscription-service");

const localBackend1: Backend = {
  id: "local-1",
  name: "Local 1",
  host: "http://localhost:8000",
  apiKey: "session-key",
  kind: "local",
};

const localBackend2: Backend = {
  id: "local-2",
  name: "Local 2",
  host: "http://localhost:9000",
  apiKey: "session-key-2",
  kind: "local",
};

describe("useOpenAISubscriptionStatus", () => {
  let queryClient: QueryClient;
  let wrapper: ({
    children,
  }: {
    children: React.ReactNode;
  }) => React.ReactElement;

  beforeEach(() => {
    __resetActiveStoreForTests();
    setRegisteredBackends([localBackend1, localBackend2]);
    setActiveSelection({ backendId: localBackend1.id, orgId: null });

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(ActiveBackendProvider, null, children),
      );
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
    __resetActiveStoreForTests();
  });

  it("includes backend.id, orgId, and connectionRevision in the query key", async () => {
    vi.mocked(LLMSubscriptionService.getOpenAIStatus).mockResolvedValue({
      vendor: "openai",
      connected: false,
      accountEmail: null,
      expiresAt: null,
    });

    const { result } = renderHook(() => useOpenAISubscriptionStatus(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const queries = queryClient.getQueryCache().findAll({
      queryKey: LLM_SUBSCRIPTION_QUERY_KEYS.all,
    });
    expect(queries).toHaveLength(1);
    expect(queries[0].queryKey).toEqual([
      ...LLM_SUBSCRIPTION_QUERY_KEYS.all,
      "openai",
      "status",
      localBackend1.id,
      null,
      0,
    ]);
  });

  it("does not leak a connected backend's status onto a different backend after switching", async () => {
    vi.mocked(LLMSubscriptionService.getOpenAIStatus)
      .mockResolvedValueOnce({
        vendor: "openai",
        connected: true,
        accountEmail: "user@backend-1.example",
        expiresAt: null,
      })
      .mockResolvedValueOnce({
        vendor: "openai",
        connected: false,
        accountEmail: null,
        expiresAt: null,
      });

    const { result, rerender } = renderHook(
      () => useOpenAISubscriptionStatus(),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data?.connected).toBe(true));

    act(() => {
      setActiveSelection({ backendId: localBackend2.id, orgId: null });
    });
    rerender();

    await waitFor(() => expect(result.current.data?.connected).toBe(false));

    // Both cache entries must exist independently, not overwrite each other.
    const queries = queryClient.getQueryCache().findAll({
      queryKey: LLM_SUBSCRIPTION_QUERY_KEYS.all,
    });
    expect(queries).toHaveLength(2);
    expect(LLMSubscriptionService.getOpenAIStatus).toHaveBeenCalledTimes(2);
  });
});
