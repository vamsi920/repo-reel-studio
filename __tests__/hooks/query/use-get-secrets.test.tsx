import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSearchSecrets } from "#/hooks/query/use-get-secrets";
import { SecretsService } from "#/api/secrets-service";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import type { Backend } from "#/api/backend-registry/types";

vi.mock("#/api/secrets-service");

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

describe("useSearchSecrets — active backend identity", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    __resetActiveStoreForTests();
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id, orgId: null });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
    __resetActiveStoreForTests();
  });

  it("refetches when the active backend's host/apiKey change in place, same backend.id", async () => {
    vi.mocked(SecretsService.getSecrets)
      .mockResolvedValueOnce([
        { name: "OLD_SECRET", description: null } as never,
      ])
      .mockResolvedValueOnce([
        { name: "NEW_SECRET", description: null } as never,
      ]);

    const { result } = renderHook(() => useSearchSecrets(), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(SecretsService.getSecrets).toHaveBeenCalledTimes(1);
    expect(result.current.data[0].name).toBe("OLD_SECRET");

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
      expect(SecretsService.getSecrets).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.data[0].name).toBe("NEW_SECRET");
    });
  });
});
