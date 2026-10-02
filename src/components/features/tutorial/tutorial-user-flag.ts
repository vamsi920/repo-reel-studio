import type { User } from "@supabase/supabase-js";
import { supabase } from "#/lib/data-platform/client";

/**
 * `user_metadata` field recording when a signed-in user finished or skipped
 * the guided tour. Stored on the Supabase Auth user (no migration needed), so
 * the tour follows the person across browsers instead of the browser.
 */
export const TUTORIAL_USER_METADATA_KEY = "neo_tour_completed_at";

/**
 * Per-user localStorage cache of the metadata flag, so a user who finishes
 * the tour isn't shown it again while the `updateUser` write is in flight or
 * if it fails.
 */
export const TUTORIAL_USER_SEEN_STORAGE_PREFIX = "neo-tutorial-seen:";

export function tutorialUserSeenStorageKey(userId: string): string {
  return `${TUTORIAL_USER_SEEN_STORAGE_PREFIX}${userId}`;
}

export function hasUserSeenTutorial(user: User): boolean {
  if (user.user_metadata?.[TUTORIAL_USER_METADATA_KEY]) return true;
  try {
    return (
      window.localStorage.getItem(tutorialUserSeenStorageKey(user.id)) !== null
    );
  } catch {
    // Inaccessible storage: treat as seen so the tour never loops.
    return true;
  }
}

/**
 * Records that `user` has finished or skipped the tour: locally right away,
 * then on their Supabase account (best-effort, never awaited by the UI).
 */
export function markTutorialSeenForUser(user: User): void {
  try {
    window.localStorage.setItem(tutorialUserSeenStorageKey(user.id), "1");
  } catch {
    // best-effort
  }
  if (!supabase || user.user_metadata?.[TUTORIAL_USER_METADATA_KEY]) return;
  supabase.auth
    .updateUser({
      data: { [TUTORIAL_USER_METADATA_KEY]: new Date().toISOString() },
    })
    .catch(() => {
      // The local key still suppresses the tour in this browser.
    });
}
