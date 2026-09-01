import type { QueryClient } from "@tanstack/react-query";
import { setLocalGithubConnected } from "#/api/git-service/github-connection-flag";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import {
  ENVIRONMENT_QUERY_KEYS,
  SETTINGS_QUERY_KEYS,
} from "#/hooks/query/query-keys";
import { NEODEVEX_PULL_REQUESTS_QUERY_KEY } from "#/hooks/query/use-neodevex-pull-requests";

/**
 * Everything that has to be refreshed for a new connection to be usable,
 * rather than merely recorded.
 *
 * Before this existed each surface invalidated a different subset --
 * `connections-settings.tsx` one set, `environment-connections.tsx` another --
 * which is why "connected" and "working" could disagree depending on where you
 * connected from.
 */
export async function invalidateConnectionCaches(
  queryClient: QueryClient,
): Promise<void> {
  // ORDER IS LOAD-BEARING.
  //
  // `git-service.api.ts` branches on `isLocalGithubConnected()`, a
  // module-level flag, and returns an EMPTY repository page (not an error)
  // when it is false. Invalidating ["repositories"] while the flag is still
  // stale refetches straight through that false branch and caches an empty
  // page for the whole staleTime -- which is exactly the "I connected GitHub
  // and the picker is still empty" symptom this function exists to cure.
  //
  // So: settle the connection query first, correct the flag from its result,
  // and only then invalidate everything that reads through it.
  await queryClient.refetchQueries({ queryKey: ["github-connection"] });

  // Written directly rather than waiting for the effect in `useUserProviders`:
  // that hook only updates the flag while one of its consumers is mounted, and
  // the connection may well have been made from a screen where none is.
  setLocalGithubConnected(
    getActiveBackend().backend.kind !== "cloud" &&
      Boolean(queryClient.getQueryData(["github-connection"])),
  );

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["jira-connection"] }),
    // Prefix match: the real key carries provider, page size, backend and org.
    queryClient.invalidateQueries({ queryKey: ["repositories"] }),
    queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEYS.all }),
    queryClient.invalidateQueries({ queryKey: ["jira-issues"] }),
    queryClient.invalidateQueries({ queryKey: ["jira-triggers"] }),
    queryClient.invalidateQueries({
      queryKey: NEODEVEX_PULL_REQUESTS_QUERY_KEY,
    }),
    queryClient.invalidateQueries({ queryKey: ENVIRONMENT_QUERY_KEYS.all }),
  ]);
}

/**
 * The exact key set above, exported so a test can assert none is quietly
 * dropped. A missing key here is invisible until someone reports that one
 * screen is stale, which is a bad way to find out.
 */
export const CONNECTION_CACHE_KEYS = [
  ["github-connection"],
  ["jira-connection"],
  ["repositories"],
  SETTINGS_QUERY_KEYS.all,
  ["jira-issues"],
  ["jira-triggers"],
  NEODEVEX_PULL_REQUESTS_QUERY_KEY,
  ENVIRONMENT_QUERY_KEYS.all,
] as const;
