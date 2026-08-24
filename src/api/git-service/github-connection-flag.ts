/**
 * Cheap synchronous "is a local (non-Cloud) GitHub connection active" check,
 * mirroring how `isCloudActive()` in `git-service.api.ts` is a cheap sync
 * check against the backend registry. `GitService`'s static methods aren't
 * hooks and can't call `useGithubConnection()` themselves, so
 * `useUserProviders` (the one hook that already needs the connection status
 * to build the provider list) keeps this flag in sync as a side effect.
 */
let connected = false;

export function setLocalGithubConnected(value: boolean): void {
  connected = value;
}

export function isLocalGithubConnected(): boolean {
  return connected;
}
