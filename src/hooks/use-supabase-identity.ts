import { useEffect, useRef } from "react";

import { useActiveBackend } from "#/contexts/active-backend-context";
import { ensureWorkspaceAccess } from "#/lib/data-platform";

import { useActiveConversation } from "./query/use-active-conversation";
import { useWorkspaceId } from "./use-workspace-id";

/** The last path segment, for a readable `workspaces.name` -- best-effort. */
function baseName(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || path
  );
}

/**
 * Silent, one-time-per-workspace bootstrap: session (anonymous sign-in) ->
 * personal org -> workspace row -> membership row. Every other Supabase call
 * gated by `is_workspace_member(workspaceId)` -- the already-existing
 * memory/activity sync included -- depends on this having run first, or it
 * keeps silently failing RLS with no session, exactly as it does today.
 *
 * No loading state, no UI, no error surfaced to the user: if Supabase is
 * unconfigured or anonymous sign-ins are disabled on the project,
 * `ensureWorkspaceAccess` resolves false and every dependent write just
 * keeps degrading to local-only, same as before this hook existed.
 */
export function useSupabaseIdentity(): void {
  const { backend } = useActiveBackend();
  const workspaceId = useWorkspaceId();
  const { data: conversation } = useActiveConversation();
  const path = conversation?.workspace?.working_dir;
  const attemptedWorkspaceId = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !backend?.id || !path) return;
    if (attemptedWorkspaceId.current === workspaceId) return;
    attemptedWorkspaceId.current = workspaceId;

    void ensureWorkspaceAccess({
      workspaceId,
      backendId: backend.id,
      path,
      name: baseName(path),
    });
  }, [workspaceId, backend?.id, path]);
}
