import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useGitRepositories } from "#/hooks/query/use-git-repositories";
import GitService from "#/api/git-service/git-service.api";

const mockUseUserProviders = vi.fn();
vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

vi.mock("#/hooks/query/use-app-installations", () => ({
  useAppInstallations: () => ({ data: undefined }),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({
    backend: { id: "test-backend", kind: "local" },
    orgId: null,
  }),
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useGitRepositories", () => {
  const retrieveUserGitRepositoriesSpy = vi.spyOn(
    GitService,
    "retrieveUserGitRepositories",
  );

  beforeEach(() => {
    retrieveUserGitRepositoriesSpy.mockReset();
    retrieveUserGitRepositoriesSpy.mockResolvedValue({
      items: [],
      next_page_id: null,
    });
  });

  it("does not fetch when the requested provider isn't in the resolved providers list", async () => {
    // Regression: `providers` can be non-empty (e.g. a different provider,
    // such as gitlab, resolved first) while the requested `provider`
    // (github) hasn't been confirmed connected yet. Gating only on
    // `providers.length > 0` let the query fire for a provider that was
    // never actually confirmed, returning an empty page that then stays
    // cached for the query's staleTime with no way to recover -- see the
    // "Open Repository always shows No Repository" report.
    mockUseUserProviders.mockReturnValue({ providers: ["gitlab"] });

    renderHook(() => useGitRepositories({ provider: "github" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(retrieveUserGitRepositoriesSpy).not.toHaveBeenCalled();
    });
  });

  it("fetches once the requested provider is in the resolved providers list", async () => {
    mockUseUserProviders.mockReturnValue({ providers: ["github"] });

    renderHook(() => useGitRepositories({ provider: "github" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(retrieveUserGitRepositoriesSpy).toHaveBeenCalledWith(
        "github",
        undefined,
        30,
      );
    });
  });

  it("does not fetch when the providers list is empty", async () => {
    mockUseUserProviders.mockReturnValue({ providers: [] });

    renderHook(() => useGitRepositories({ provider: "github" }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(retrieveUserGitRepositoriesSpy).not.toHaveBeenCalled();
    });
  });

  it("surfaces the underlying query error instead of swallowing it", async () => {
    mockUseUserProviders.mockReturnValue({ providers: ["github"] });
    retrieveUserGitRepositoriesSpy.mockReset();
    retrieveUserGitRepositoriesSpy.mockRejectedValue(
      new Error("github_auth_error"),
    );

    const { result } = renderHook(
      () => useGitRepositories({ provider: "github" }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toBe("github_auth_error");
  });
});
