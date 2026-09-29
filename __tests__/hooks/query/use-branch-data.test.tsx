import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useBranchData } from "#/hooks/query/use-branch-data";
import { GithubProxyError } from "#/api/git-service/local-github-service.api";

const mockUseRepositoryBranchesPaginated = vi.fn();
vi.mock("#/hooks/query/use-repository-branches", () => ({
  useRepositoryBranchesPaginated: (...args: unknown[]) =>
    mockUseRepositoryBranchesPaginated(...args),
}));

const mockUseSearchBranches = vi.fn();
vi.mock("#/hooks/query/use-search-branches", () => ({
  useSearchBranches: (...args: unknown[]) => mockUseSearchBranches(...args),
}));

const mockUseUserProviders = vi.fn();
vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

const defaultPaginatedResult = {
  data: undefined,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isLoading: false,
  isFetchingNextPage: false,
  isError: false,
  error: null,
};

const defaultSearchResult = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
};

describe("useBranchData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRepositoryBranchesPaginated.mockReturnValue(defaultPaginatedResult);
    mockUseSearchBranches.mockReturnValue(defaultSearchResult);
    mockUseUserProviders.mockReturnValue({ isGithubDisconnected: false });
  });

  it("surfaces the paginated list query's error", () => {
    const listError = new Error("network error");
    mockUseRepositoryBranchesPaginated.mockReturnValue({
      ...defaultPaginatedResult,
      isError: true,
      error: listError,
    });

    const { result } = renderHook(() =>
      useBranchData("user/repo", "github", null, "", ""),
    );

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(listError);
  });

  it("surfaces the search query's error even when the list query is fine", () => {
    // Regression: a search-only failure (the common case once the user
    // types anything -- `branches` switches to the search results) used to
    // be dropped entirely, so it looked like "no branches" instead of a
    // real error. See the "branch dropdown shows a permanent empty state"
    // report.
    const searchError = new GithubProxyError(
      "Your GitHub connection isn't working. Reconnect it in Settings > Connections.",
      "github_auth_error",
    );
    mockUseSearchBranches.mockImplementation(
      (_repo: unknown, query: unknown) =>
        query === "feat"
          ? { ...defaultSearchResult, isError: true, error: searchError }
          : defaultSearchResult,
    );

    const { result } = renderHook(() =>
      useBranchData("user/repo", "github", null, "feat", "feat"),
    );

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(searchError);
  });

  it("reports the provider as disconnected when useUserProviders confirms no github connection", () => {
    mockUseUserProviders.mockReturnValue({ isGithubDisconnected: true });

    const { result } = renderHook(() =>
      useBranchData("user/repo", "github", null, "", ""),
    );

    expect(result.current.isProviderDisconnected).toBe(true);
  });

  it("does not report disconnected for a non-github provider", () => {
    mockUseUserProviders.mockReturnValue({ isGithubDisconnected: true });

    const { result } = renderHook(() =>
      useBranchData("user/repo", "gitlab", null, "", ""),
    );

    expect(result.current.isProviderDisconnected).toBe(false);
  });

  it("reports the provider as disconnected on a live github_auth_error even when the DB connection row still exists", () => {
    mockUseUserProviders.mockReturnValue({ isGithubDisconnected: false });
    mockUseRepositoryBranchesPaginated.mockReturnValue({
      ...defaultPaginatedResult,
      isError: true,
      error: new GithubProxyError(
        "Your GitHub connection isn't working. Reconnect it in Settings > Connections.",
        "github_auth_error",
      ),
    });

    const { result } = renderHook(() =>
      useBranchData("user/repo", "github", null, "", ""),
    );

    expect(result.current.isProviderDisconnected).toBe(true);
  });

  it("reports the provider as disconnected on a live not_connected error from the search query", () => {
    mockUseUserProviders.mockReturnValue({ isGithubDisconnected: false });
    mockUseSearchBranches.mockImplementation(
      (_repo: unknown, query: unknown) =>
        query === "feat"
          ? {
              ...defaultSearchResult,
              isError: true,
              error: new GithubProxyError(
                "Connect your GitHub account before browsing repositories.",
                "not_connected",
              ),
            }
          : defaultSearchResult,
    );

    const { result } = renderHook(() =>
      useBranchData("user/repo", "github", null, "feat", "feat"),
    );

    expect(result.current.isProviderDisconnected).toBe(true);
  });

  // Regression: matching on `error.message` against a literal
  // "GitHub API error (401)" string stopped working once the proxy client
  // started returning friendly, translated-sounding text instead -- so a
  // plain Error carrying that dead literal must NOT be mistaken for a real
  // disconnect (see use-repository-data.tsx's identical fix).
  it("does not report disconnected for a plain error carrying the old dead literal text", () => {
    mockUseUserProviders.mockReturnValue({ isGithubDisconnected: false });
    mockUseRepositoryBranchesPaginated.mockReturnValue({
      ...defaultPaginatedResult,
      isError: true,
      error: new Error("GitHub API error (401)"),
    });

    const { result } = renderHook(() =>
      useBranchData("user/repo", "github", null, "", ""),
    );

    expect(result.current.isProviderDisconnected).toBe(false);
  });

  it("does not report disconnected for an unrelated proxy error code", () => {
    mockUseUserProviders.mockReturnValue({ isGithubDisconnected: false });
    mockUseRepositoryBranchesPaginated.mockReturnValue({
      ...defaultPaginatedResult,
      isError: true,
      error: new GithubProxyError(
        "GitHub is temporarily unreachable. Please try again.",
        "github_api_error",
      ),
    });

    const { result } = renderHook(() =>
      useBranchData("user/repo", "github", null, "", ""),
    );

    expect(result.current.isProviderDisconnected).toBe(false);
  });
});
