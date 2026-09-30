/**
 * With no `?repository=` in the URL, Security fell back to whichever
 * connected repository sorted first by id, every time -- a user who always
 * works in a different repository had to re-pick it on every visit. Remembers
 * the last repository actually viewed as a local-only UI preference, the same
 * way `automation-view-mode.ts` / `narration-preference.ts` remember theirs
 * (not through `misc_settings.app_preferences` on the backend -- this is a
 * per-browser convenience, not account state).
 */
export const SECURITY_LAST_REPOSITORY_STORAGE_KEY =
  "openhands-security-last-repository-id";

export function readLastSecurityRepositoryId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(SECURITY_LAST_REPOSITORY_STORAGE_KEY);
}

export function writeLastSecurityRepositoryId(repositoryId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SECURITY_LAST_REPOSITORY_STORAGE_KEY,
    repositoryId,
  );
}
