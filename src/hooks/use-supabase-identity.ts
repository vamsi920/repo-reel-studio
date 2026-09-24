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
 * Backoff schedule for a failed bootstrap attempt. A transient failure
 * (network blip, a cold Supabase project, `signInAnonymously` briefly
 * rate-limited) used to be indistinguishable from a permanent one: nothing
 * ever retried, so this workspace's memory/activity/usage sync stayed
 * degraded to local-only for the rest of the session even after
 * connectivity recovered a few seconds later.
 */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];

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
 * keeps degrading to local-only, same as before this hook existed. Only a
 * *successful* bootstrap is remembered as "done" for this workspace id -- a
 * failed one retries (see `RETRY_DELAYS_MS`) rather than being marked
 * attempted and never revisited.
 */
export function useSupabaseIdentity(): void {
  const { backend } = useActiveBackend();
  const workspaceId = useWorkspaceId();
  const { data: conversation } = useActiveConversation();
  const path = conversation?.workspace?.working_dir;
  const succeededWorkspaceId = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !backend?.id || !path) return undefined;
    if (succeededWorkspaceId.current === workspaceId) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempt = (retriesLeft: number) => {
      void ensureWorkspaceAccess({
        workspaceId,
        backendId: backend.id,
        path,
        name: baseName(path),
      }).then((ok) => {
        if (cancelled) return;
        if (ok) {
          succeededWorkspaceId.current = workspaceId;
          return;
        }
        if (retriesLeft <= 0) return;
        const delay = RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - retriesLeft];
        timer = setTimeout(() => attempt(retriesLeft - 1), delay);
      });
    };

    attempt(RETRY_DELAYS_MS.length);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [workspaceId, backend?.id, path]);
}
