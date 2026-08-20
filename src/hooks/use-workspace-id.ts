import { useMemo } from "react";

import { useActiveBackend } from "#/contexts/active-backend-context";
import { computeWorkspaceId } from "#/lib/workspace-memory";

import { useActiveConversation } from "./query/use-active-conversation";

/**
 * The isolation boundary, resolved from live app state: which agent-server we
 * are talking to, and which directory it is working in.
 *
 * Returns null until both are known. Callers must then skip memory entirely
 * rather than fall back to a shared bucket -- see `computeWorkspaceId`.
 */
export function useWorkspaceId(): string | null {
  const { backend } = useActiveBackend();
  const { data: conversation } = useActiveConversation();
  const workingDir = conversation?.workspace?.working_dir;

  return useMemo(
    () => computeWorkspaceId(backend?.id, workingDir),
    [backend?.id, workingDir],
  );
}
