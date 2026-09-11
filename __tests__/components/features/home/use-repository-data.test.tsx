import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useRepositoryData } from "#/components/features/home/git-repo-dropdown/use-repository-data";

const mockUseGitRepositories = vi.fn();
vi.mock("#/hooks/query/use-git-repositories", () => ({
  useGitRepositories: (...args: unknown[]) => mockUseGitRepositories(...args),
}));

const mockUseSearchRepositories = vi.fn();
vi.mock("#/hooks/query/use-search-repositories", () => ({
  useSearchRepositories: (...args: unknown[]) =>
    mockUseSearchRepositories(...args),
}));

const mockUseUserProviders = vi.fn();
vi.mock("#/hooks/use-user-providers", () => ({
  useUserProviders: () => mockUseUserProviders(),
}));

const defaultGitRepositoriesResult = {
  data: undefined,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isLoading: false,
  isFetchingNextPage: false,
  isError: false,
};

const defaultSearchRepositoriesResult = {
  data: undefined,
  isLoading: false,
};

describe("useRepositoryData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGitRepositories.mockReturnValue(defaultGitRepositoriesResult);
    mockUseSearchRepositories.mockReturnValue(defaultSearchRepositoriesResult);
  });

  it("disables the search query while the provider hasn't resolved as connected yet", () => {
    // Regression: a local (non-Cloud) GitHub connection is only known once
    // `useUserProviders` resolves it into `providers`. GitService resolves
    // this same connection via a plain flag that isn't part of any query
    // key, so firing the search query before `providers` includes the
    // active provider caches an empty result for the query's staleTime
    // with no way to recover -- see the "Open Repository always shows No
    // Repository" report.
    mockUseUserProviders.mockReturnValue({ providers: [] });

    renderHook(() =>
      useRepositoryData("github", false, "neo-qa-fixture", [], "neo-qa-fixture"),
    );

    expect(mockUseSearchRepositories).toHaveBeenCalledWith(
      "neo-qa-fixture",
      "github",
      true,
    );
  });

  it("enables the search query once the provider is in the resolved providers list", () => {
    mockUseUserProviders.mockReturnValue({ providers: ["github"] });

    renderHook(() =>
      useRepositoryData("github", false, "neo-qa-fixture", [], "neo-qa-fixture"),
    );

    expect(mockUseSearchRepositories).toHaveBeenCalledWith(
      "neo-qa-fixture",
      "github",
      false,
    );
  });

  it("keeps the search query disabled when skipping search regardless of provider readiness", () => {
    mockUseUserProviders.mockReturnValue({ providers: ["github"] });

    renderHook(() =>
      useRepositoryData(
        "github",
        false,
        "user/repo",
        [],
        "user/repo",
        "1",
        "user/repo",
      ),
    );

    expect(mockUseSearchRepositories).toHaveBeenCalledWith(
      "user/repo",
      "github",
      true,
    );
  });
});
