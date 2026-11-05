import { useEffect } from "react";
import { startCloudStateSync } from "#/lib/data-platform/cloud-state-sync";

/**
 * Keeps studio projects, conversation metadata, pinned/archived chats and
 * recent repositories in the signed-in user's Supabase row, so they are the
 * same in every browser, on localhost and in production.
 */
export function useCloudStateSync() {
  useEffect(() => startCloudStateSync(), []);
}
