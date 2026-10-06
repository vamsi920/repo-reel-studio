import { useUserProviders } from "#/hooks/use-user-providers";
import { useConnectionsRealtimeSync } from "#/hooks/use-connections-realtime-sync";
import { useGlobalOAuthReceipt } from "#/hooks/use-global-oauth-receipt";

/**
 * Renders nothing; exists so two pieces of global state are always correct.
 *
 * `isLocalGithubConnected()` (`src/api/git-service/github-connection-flag.ts`)
 * is a module-level `let` whose only writer is an effect inside
 * `useUserProviders`. If no component calling that hook happens to be mounted,
 * the flag stays `false` and `GitService` silently returns empty repository
 * pages -- a latent bug well beyond onboarding, and the reason connecting from
 * a screen other than Settings appeared to do nothing.
 *
 * Mounting this once in the root layout makes the flag correct on every route,
 * starts the Realtime subscription that keeps connection state fresh across
 * tabs and teammates, and consumes the OAuth receipt on routes that do not
 * parse it themselves.
 */
export function ConnectionSyncSentinel() {
  useUserProviders();
  useConnectionsRealtimeSync();
  useGlobalOAuthReceipt();
  return null;
}
