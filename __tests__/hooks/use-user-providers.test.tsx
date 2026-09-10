import React from "react";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { isLocalGithubConnected } from "#/api/git-service/github-connection-flag";
import { useUserProviders } from "#/hooks/use-user-providers";

const mockUseSettings = vi.fn();
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => mockUseSettings(),
}));

const mockUseGithubConnection = vi.fn();
vi.mock("#/hooks/query/use-github-connection", () => ({
  useGithubConnection: () => mockUseGithubConnection(),
}));

const localBackend: Backend = {
  id: "local-1",
  name: "Local 1",
  host: "http://localhost:9000",
  apiKey: "k",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-key",
  kind: "cloud",
};

function wrapper({ children }: React.PropsWithChildren) {
  return <ActiveBackendProvider>{children}</ActiveBackendProvider>;
}

const renderUserProviders = () =>
  renderHook(() => useUserProviders(), { wrapper });

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  mockUseSettings.mockReturnValue({
    data: { provider_tokens_set: {} },
    isLoading: false,
  });
  mockUseGithubConnection.mockReturnValue({
    data: { githubUsername: "octocat", enterpriseHost: null, connectedAt: "" },
  });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.clearAllMocks();
});

describe("useUserProviders", () => {
  it("includes github once a local backend is active and a github connection exists", () => {
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });

    const { result } = renderUserProviders();

    expect(result.current.providers).toContain("github");
    expect(isLocalGithubConnected()).toBe(true);
  });

  it("excludes github while a Cloud backend is active, even with a real connection", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    const { result } = renderUserProviders();

    expect(result.current.providers).not.toContain("github");
    expect(isLocalGithubConnected()).toBe(false);
  });

  // Regression: `useUserProviders` used to read the backend registry via
  // the raw, non-reactive `getActiveBackend()` getter instead of the
  // subscribed `useActiveBackend()` hook, so a backend switch that
  // happened after mount (without any other prop/state change forcing a
  // re-render) never updated the derived `providers` list.
  it("reactively drops github when the active backend switches from local to Cloud", () => {
    setRegisteredBackends([localBackend, cloudBackend]);
    setActiveSelection({ backendId: localBackend.id });

    const { result, rerender } = renderUserProviders();
    expect(result.current.providers).toContain("github");

    setActiveSelection({ backendId: cloudBackend.id });
    rerender();

    expect(result.current.providers).not.toContain("github");
    expect(isLocalGithubConnected()).toBe(false);
  });

  it("reactively adds github when the active backend switches from Cloud to local", () => {
    setRegisteredBackends([localBackend, cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    const { result, rerender } = renderUserProviders();
    expect(result.current.providers).not.toContain("github");

    setActiveSelection({ backendId: localBackend.id });
    rerender();

    expect(result.current.providers).toContain("github");
  });
});
