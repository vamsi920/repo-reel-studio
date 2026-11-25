import React from "react";
import { useConnections } from "#/hooks/query/use-connections";
import { needsReconnect } from "#/lib/environment/connection-health";
import { useNavigation } from "#/context/navigation-context";
import { isDesktopApp } from "#/utils/utils";
import {
  claimAutoReconnect,
  isGithubProvider,
  startGithubOAuth,
  takeGithubReturnPath,
} from "#/services/github-reconnect";

const CALLBACK_LANDING_PATH = "/settings/connections";

/**
 * Keeps GitHub connected without asking (see `services/github-reconnect.ts`).
 *
 * Decides once per page load: if the stored GitHub connection is rejected
 * when the app opens, it re-authorizes through GitHub (no prompt for an app
 * the user already approved) and comes back to the same page. Never in the
 * desktop app, whose window has no GitHub session, and never more than once
 * per cooldown, so a revoked app approval shows the normal banner instead of
 * looping.
 */
export function useGithubSelfHeal(): void {
  const { data: connections } = useConnections();
  const { currentPath, navigate } = useNavigation();
  const decided = React.useRef(false);

  // Back from a reconnect (the callback always lands on Settings >
  // Connections): return to where the user was. Keyed on the landing page,
  // not the `?connected=github` marker, which that page may strip first.
  React.useEffect(() => {
    if (!currentPath.startsWith(CALLBACK_LANDING_PATH)) return;
    const back = takeGithubReturnPath();
    if (back && back !== currentPath) navigate(back, { replace: true });
  }, [currentPath, navigate]);

  React.useEffect(() => {
    if (decided.current || !connections) return;
    decided.current = true;
    if (typeof window === "undefined" || isDesktopApp()) return;
    if (document.visibilityState !== "visible") return;
    const broken = connections.find(
      (c) => isGithubProvider(c.providerId) && needsReconnect(c),
    );
    if (!broken || !claimAutoReconnect()) return;
    const enterpriseHost =
      typeof broken.config?.enterpriseHost === "string"
        ? broken.config.enterpriseHost
        : null;
    startGithubOAuth({
      enterpriseHost,
      returnTo: `${currentPath}${window.location.search}`,
    })
      .then(({ authorizeUrl }) => window.location.assign(authorizeUrl))
      .catch(() => {
        // The banner still offers Reconnect.
      });
  }, [connections, currentPath]);
}
