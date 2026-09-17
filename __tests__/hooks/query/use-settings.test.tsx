import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import SettingsService from "#/api/settings-service/settings-service.api";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { useSettings } from "#/hooks/query/use-settings";
import { DEFAULT_SETTINGS } from "#/services/settings";
import type { Backend } from "#/api/backend-registry/types";

const localBackend: Backend = {
  id: "local-a",
  name: "Local A",
  host: "http://127.0.0.1:8001",
  apiKey: "old-key",
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
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });
  vi.spyOn(SettingsService, "getSettings").mockResolvedValue({
    ...DEFAULT_SETTINGS,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  __resetActiveStoreForTests();
});

describe("useSettings — active backend identity", () => {
  it("refetches when the active backend's host/apiKey change in place, same backend.id", async () => {
    const { result } = renderHook(() => useSettings(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(SettingsService.getSettings).toHaveBeenCalledTimes(1);

    // Same backend.id/orgId — only the connection details changed, as
    // updateBackend() does when a user edits a registered backend's host
    // or rotates its API key in place.
    setRegisteredBackends([
      { ...localBackend, host: "http://127.0.0.1:9999", apiKey: "new-key" },
    ]);

    await waitFor(() => {
      expect(SettingsService.getSettings).toHaveBeenCalledTimes(2);
    });
  });
});
