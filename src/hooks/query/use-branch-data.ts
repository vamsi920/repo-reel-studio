import { useMemo } from "react";
import { useRepositoryBranchesPaginated } from "./use-repository-branches";
import { useSearchBranches } from "./use-search-branches";
import { Branch } from "#/types/git";
import { Provider } from "#/types/settings";
import { useUserProviders } from "#/hooks/use-user-providers";
import { GithubProxyError } from "#/api/git-service/local-github-service.api";

export function useBranchData(
  repository: string | null,
  provider: Provider,
  defaultBranch: string | null,
  processedSearchInput: string,
  inputValue: string,
  selectedBranch?: Branch | null,
) {
  // Fetch branches with pagination
  const {
    data: branchData,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
    isError,
    error,
  } = useRepositoryBranchesPaginated(repository, 30, provider);

  // Search branches when user types
  const {
    data: searchData,
    isLoading: isSearchLoading,
    isError: isSearchError,
    error: searchError,
  } = useSearchBranches(repository, processedSearchInput, 30, provider);

  // Combine all branches from paginated data - use .items for V1 response
  const allBranches = useMemo(
    () =>
      branchData?.pages?.flatMap((page: { items: Branch[] }) => page.items) ||
      [],
    [branchData],
  );

  // Check if default branch is in the loaded branches
  const defaultBranchInLoaded = useMemo(
    () =>
      defaultBranch
        ? allBranches.find((branch: Branch) => branch.name === defaultBranch)
        : null,
    [allBranches, defaultBranch],
  );

  // Only search for default branch if it's not already in the loaded branches
  // and we have loaded some branches (to avoid searching immediately on mount)
  const shouldSearchDefaultBranch =
    defaultBranch &&
    !defaultBranchInLoaded &&
    allBranches.length > 0 &&
    !processedSearchInput; // Don't search for default branch when user is searching

  const {
    data: defaultBranchData,
    isLoading: isDefaultBranchLoading,
    isError: isDefaultBranchError,
    error: defaultBranchError,
  } = useSearchBranches(
    repository,
    shouldSearchDefaultBranch ? defaultBranch : "",
    30,
    provider,
  );

  // `isGithubDisconnected` (DB-row presence only) plus a live auth failure
  // from any of the three branch queries above -- matching
  // useRepositoryData's isProviderDisconnected for the sibling repository
  // dropdown -- so a dead GitHub connection always renders the same
  // actionable message instead of a bare "No branches found"/"No branches
  // available" empty state that looks identical to a repository that
  // genuinely has no branches. Branch lookups go through the same
  // GithubProxyError-throwing invokeProxy helper as repository lookups
  // (getLocalGithubRepositoryBranches), so check its error code rather than
  // matching on `message` -- a friendly, i18n-facing string that can (and
  // did: see use-repository-data.tsx) change wording without notice.
  const { isGithubDisconnected } = useUserProviders();
  const combinedError = error ?? searchError ?? defaultBranchError ?? null;
  const isGithubAuthFailure =
    provider === "github" &&
    combinedError instanceof GithubProxyError &&
    (combinedError.code === "github_auth_error" ||
      combinedError.code === "not_connected");
  const isProviderDisconnected =
    provider === "github" && (isGithubDisconnected || isGithubAuthFailure);

  // Get branches to display with default branch prioritized
  const branches = useMemo(() => {
    // Don't use search results if input exactly matches selected branch
    const shouldUseSearch =
      processedSearchInput &&
      searchData &&
      !(inputValue === selectedBranch?.name);

    let branchesToUse = shouldUseSearch ? searchData : allBranches;

    // If we have a default branch, ensure it's at the top of the list
    if (defaultBranch) {
      // Use the already computed defaultBranchInLoaded or check in current branches
      let defaultBranchObj = shouldUseSearch
        ? branchesToUse.find((branch: Branch) => branch.name === defaultBranch)
        : defaultBranchInLoaded;

      // If not found in current branches, check if we have it from the default branch search
      if (
        !defaultBranchObj &&
        defaultBranchData &&
        defaultBranchData.length > 0
      ) {
        defaultBranchObj = defaultBranchData.find(
          (branch) => branch.name === defaultBranch,
        );

        // Add the default branch to the beginning of the list
        if (defaultBranchObj) {
          branchesToUse = [defaultBranchObj, ...branchesToUse];
        }
      } else if (defaultBranchObj) {
        // If found in current branches, move it to the front
        const otherBranches = branchesToUse.filter(
          (branch) => branch.name !== defaultBranch,
        );
        branchesToUse = [defaultBranchObj, ...otherBranches];
      }
    }

    return branchesToUse;
  }, [
    processedSearchInput,
    searchData,
    allBranches,
    selectedBranch,
    inputValue,
    defaultBranch,
    defaultBranchInLoaded,
    defaultBranchData,
  ]);

  return {
    branches,
    allBranches,
    fetchNextPage,
    hasNextPage,
    isLoading: isLoading || isDefaultBranchLoading,
    isFetchingNextPage,
    // Previously only the paginated list query's error reached the
    // dropdown -- a search-only failure (the common case once the user
    // types anything) was invisible here. See the "branch dropdown shows a
    // permanent empty state" report.
    isError: isError || isSearchError || isDefaultBranchError,
    error: combinedError,
    isSearchLoading,
    isProviderDisconnected,
  };
}
