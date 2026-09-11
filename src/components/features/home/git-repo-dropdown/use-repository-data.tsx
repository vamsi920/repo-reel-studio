import { useMemo, useEffect } from "react";
import { Provider } from "#/types/settings";
import { GitRepository } from "#/types/git";
import { useGitRepositories } from "#/hooks/query/use-git-repositories";
import { useSearchRepositories } from "#/hooks/query/use-search-repositories";
import { useUserProviders } from "#/hooks/use-user-providers";

export function useRepositoryData(
  provider: Provider,
  disabled: boolean,
  processedSearchInput: string,
  urlSearchResults: GitRepository[],
  inputValue: string,
  value?: string | null,
  repositoryName?: string | null,
) {
  // Fetch user repositories with pagination
  const {
    data: repoData,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
    isError,
    error: listError,
  } = useGitRepositories({
    provider,
    enabled: !disabled,
  });

  // Determine if we should skip search (when input matches selected repository)
  const shouldSkipSearch = useMemo(
    () => inputValue === repositoryName,
    [repositoryName, inputValue],
  );

  // `providers` only includes `provider` once its connection status is
  // actually known (see useUserProviders / GitService.isLocalGithubActive).
  // GitService's search/list calls resolve a local GitHub connection via a
  // plain module flag that isn't part of any query key, so a search fired
  // before that flag settles gets cached as an empty result for
  // `staleTime` (5 min) with no way to self-correct. useGitRepositories
  // already withholds its fetch until `provider` is in `providers`; gate
  // the search query the same way so it can't fire -- and cache an empty
  // page -- ahead of that.
  const { providers } = useUserProviders();
  const isProviderReady = !!provider && providers.includes(provider);

  // Search repositories when user types
  const {
    data: searchData,
    isLoading: isSearchLoading,
    isError: isSearchError,
    error: searchError,
  } = useSearchRepositories(
    processedSearchInput,
    provider,
    shouldSkipSearch || !isProviderReady,
  );

  // Combine all repositories from paginated data
  const allRepositories = useMemo(
    () => repoData?.pages?.flatMap((page) => page.items) || [],
    [repoData],
  );

  // Find selected repository from all possible sources
  const selectedRepository = useMemo(() => {
    if (!value) return null;

    // Search in all possible repository sources
    const allPossibleRepos = [
      ...allRepositories,
      ...urlSearchResults,
      ...(searchData || []),
    ];

    return allPossibleRepos.find((repo) => repo.id === value) || null;
  }, [allRepositories, urlSearchResults, searchData, value]);

  // Get repositories to display (URL search, regular search, or all repos)
  const repositories = useMemo(() => {
    // Prioritize URL search results when available
    if (urlSearchResults.length > 0) {
      return urlSearchResults;
    }

    // Don't use search results if input exactly matches selected repository
    const shouldUseSearch =
      processedSearchInput &&
      searchData &&
      !(inputValue === selectedRepository?.full_name);

    if (shouldUseSearch) {
      return searchData;
    }
    return allRepositories;
  }, [
    urlSearchResults,
    processedSearchInput,
    searchData,
    allRepositories,
    selectedRepository,
    inputValue,
  ]);

  // Auto-load more repositories when there aren't enough items to create a scrollable dropdown
  useEffect(() => {
    const shouldAutoLoad =
      !disabled &&
      !isLoading &&
      !isFetchingNextPage &&
      !isSearchLoading &&
      hasNextPage &&
      !processedSearchInput && // Not during search (use all repos, not search results)
      urlSearchResults.length === 0 &&
      repositories.length > 0 && // Have some repositories loaded
      repositories.length < 10; // But not enough to create a scrollable dropdown

    if (shouldAutoLoad) {
      fetchNextPage();
    }
  }, [
    disabled,
    isLoading,
    isFetchingNextPage,
    isSearchLoading,
    hasNextPage,
    processedSearchInput,
    urlSearchResults.length,
    repositories.length,
    fetchNextPage,
  ]);

  return {
    repositories,
    allRepositories,
    selectedRepository,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
    // A search-query failure (e.g. a dead GitHub credential returning a
    // proxy error) used to be invisible here -- only the list query's
    // isError was surfaced, so typing into the search box during an outage
    // silently fell through to "no results" instead of a real error. See
    // the "Open Repository silently shows empty results" report.
    isError: isError || isSearchError,
    error: listError ?? searchError ?? null,
    isSearchLoading,
  };
}
