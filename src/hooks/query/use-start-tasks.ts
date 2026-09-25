import { useQuery } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import type { AppConversationStartTask } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Hook to fetch in-progress conversation start tasks
 *
 * Use case: Show tasks that are provisioning sandboxes, cloning repos, etc.
 * These are conversations that started but haven't reached READY or ERROR status yet.
 *
 * Note: Filters out READY and ERROR status tasks client-side since backend doesn't support status filtering.
 *
 * @param limit Maximum number of tasks to return (max 100)
 * @returns Query result with array of in-progress start tasks
 */
export const useStartTasks = (limit = 10) => {
  const active = useActiveBackend();

  return useQuery({
    // Scope by backend/org so switching accounts or backends doesn't keep
    // showing the previous account's provisioning cards from cache.
    queryKey: ["start-tasks", "search", limit, active.backend.id, active.orgId],
    queryFn: (): Promise<AppConversationStartTask[]> =>
      AgentServerConversationService.searchStartTasks(limit),
    // Poll at the same cadence as the conversation list (see
    // usePaginatedConversations) so a task's status transition to
    // READY/ERROR — and its card disappearing — shows up without a manual
    // refresh.
    refetchInterval: 10_000,
    select: (tasks) =>
      tasks.filter(
        (task) => task.status !== "READY" && task.status !== "ERROR",
      ),
  });
};
