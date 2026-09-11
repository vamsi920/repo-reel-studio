import React from "react";
import { convertRawProvidersToList } from "#/utils/convert-raw-providers-to-list";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { setLocalGithubConnected } from "#/api/git-service/github-connection-flag";
import { useSettings } from "./query/use-settings";
import { useGithubConnection } from "./query/use-github-connection";

export const useUserProviders = () => {
  const { data: settings, isLoading: isLoadingSettings } = useSettings();
  const {
    data: githubConnection,
    isPending: isGithubConnectionPending,
    fetchStatus: githubConnectionFetchStatus,
    isError: isGithubConnectionError,
  } = useGithubConnection();
  // Reactive read: the raw `getActiveBackend()` store getter doesn't
  // subscribe to backend-registry changes, so a backend switch that
  // happens after this hook first mounts (onboarding seeding the default
  // backend, the user adding/switching backends) would never re-trigger
  // this memo -- `providers` would keep reflecting whichever backend was
  // active on first render. `useActiveBackend()` re-renders on every
  // backend-registry change, same as `useGitRepositories` already does.
  const { backend } = useActiveBackend();

  // Local (non-Cloud) GitHub connections are a separate system from Cloud's
  // provider_tokens_set (see docs on GitService's isCloudActive() branch) --
  // only relevant, and only added to the provider list, when the active
  // backend isn't Cloud (Cloud already has its own real provider list).
  const hasLocalGithubConnection =
    backend.kind !== "cloud" && Boolean(githubConnection);

  React.useEffect(() => {
    setLocalGithubConnected(hasLocalGithubConnection);
  }, [hasLocalGithubConnection]);

  // Dev-only diagnostic: a local (non-Cloud) backend with no working GitHub
  // connection leaves `providers` without "github" and, from there, leaves
  // useGitRepositories's query permanently disabled with zero other signal
  // (see the "Open Repository always shows No Repository" report). Pending
  // + idle fetchStatus means the underlying query never even attempted a
  // fetch (e.g. the Supabase session hasn't resolved to a real user yet) --
  // that is a different failure mode than a fetch that ran and resolved to
  // "no connection", and neither was distinguishable from here before.
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (backend.kind === "cloud" || hasLocalGithubConnection) return;
    const queryNeverAttempted =
      isGithubConnectionPending && githubConnectionFetchStatus === "idle";
    console.debug(
      '[useUserProviders] local GitHub connection unavailable, "github" omitted from providers',
      {
        backendKind: backend.kind,
        queryNeverAttempted,
        isGithubConnectionPending,
        githubConnectionFetchStatus,
        isGithubConnectionError,
      },
    );
  }, [
    backend.kind,
    hasLocalGithubConnection,
    isGithubConnectionPending,
    githubConnectionFetchStatus,
    isGithubConnectionError,
  ]);

  const providers = React.useMemo(() => {
    const list = convertRawProvidersToList(settings?.provider_tokens_set);
    if (hasLocalGithubConnection && !list.includes("github")) {
      return [...list, "github" as const];
    }
    return list;
  }, [settings?.provider_tokens_set, hasLocalGithubConnection]);

  return {
    providers,
    isLoadingSettings,
  };
};
