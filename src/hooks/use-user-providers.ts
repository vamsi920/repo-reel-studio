import React from "react";
import { convertRawProvidersToList } from "#/utils/convert-raw-providers-to-list";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { setLocalGithubConnected } from "#/api/git-service/github-connection-flag";
import { useSettings } from "./query/use-settings";
import { useGithubConnection } from "./query/use-github-connection";

export const useUserProviders = () => {
  const { data: settings, isLoading: isLoadingSettings } = useSettings();
  const { data: githubConnection } = useGithubConnection();
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
