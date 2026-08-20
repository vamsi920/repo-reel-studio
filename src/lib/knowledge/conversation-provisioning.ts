import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Waits for a just-created conversation's workspace to be usable, handling
 * both backends' creation timing:
 *  - Local: conversations are created synchronously, so `conversationId` is
 *    already a real id — this just polls until `workspace.working_dir`
 *    resolves (the same signal src/routes/kt-list.tsx already relies on;
 *    there's no separate "ready" boolean anywhere on AppConversation).
 *  - Cloud: `conversationId` may be a transitional `task-{id}` string while
 *    the sandbox provisions. Polls the start-task first, then switches to
 *    polling the real conversation once `app_conversation_id` appears.
 */
export async function waitForWorkspaceReady(
  conversationId: string,
  taskId: string | undefined,
): Promise<AppConversation> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let resolvedId = conversationId;

  if (resolvedId.startsWith("task-") && taskId) {
    for (;;) {
      const task = await AgentServerConversationService.getStartTask(taskId);
      if (task?.status === "ERROR") {
        throw new Error(task.detail ?? "Conversation failed to start.");
      }
      if (task?.status === "READY" && task.app_conversation_id) {
        resolvedId = task.app_conversation_id;
        break;
      }
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for the conversation to start.");
      }
      await delay(POLL_INTERVAL_MS);
    }
  }

  for (;;) {
    const [conversation] =
      await AgentServerConversationService.batchGetAppConversations([
        resolvedId,
      ]);
    if (conversation?.workspace?.working_dir?.trim()) {
      return conversation;
    }
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for the workspace to provision.");
    }
    await delay(POLL_INTERVAL_MS);
  }
}
