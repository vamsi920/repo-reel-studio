/**
 * Watch KT's narration toggle (`KT$NARRATION_TOOLTIP_ENABLED` in kt-page.tsx)
 * used to reset to off on every page navigation and reload -- a per-viewer
 * convenience, so it's remembered the same way other local-only UI
 * preferences are (see `automation-view-mode.ts`), not through
 * `misc_settings.app_preferences` on the backend.
 */
export const KT_NARRATION_STORAGE_KEY = "openhands-kt-video-narration-enabled";

export function readStoredNarrationPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(KT_NARRATION_STORAGE_KEY) === "true";
}

export function writeStoredNarrationPreference(enabled: boolean): void {
  window.localStorage.setItem(KT_NARRATION_STORAGE_KEY, String(enabled));
}
