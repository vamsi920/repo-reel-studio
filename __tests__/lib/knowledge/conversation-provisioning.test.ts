import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import type { AppConversationStartTask } from "#/api/conversation-service/agent-server-conversation-service.types";

const getStartTask = vi.fn();
const batchGetAppConversations = vi.fn();
vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: {
      getStartTask: (...args: unknown[]) => getStartTask(...args),
      batchGetAppConversations: (...args: unknown[]) =>
        batchGetAppConversations(...args),
    },
  }),
);

const { waitForWorkspaceReady } =
  await import("#/lib/knowledge/conversation-provisioning");

function conversation(workingDir: string | undefined): AppConversation {
  return {
    workspace: workingDir ? { working_dir: workingDir } : undefined,
  } as AppConversation;
}

function startTask(
  overrides: Partial<AppConversationStartTask>,
): AppConversationStartTask {
  return {
    status: "WORKING",
    app_conversation_id: null,
    detail: null,
    ...overrides,
  } as AppConversationStartTask;
}

// Each reconnect/poll waits on a real timer before asking again.
async function settle<T>(promise: Promise<T>): Promise<T> {
  const outcome = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const result = await outcome;
  if (!result.ok) throw result.error;
  return result.value;
}

describe("waitForWorkspaceReady", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getStartTask.mockReset();
    batchGetAppConversations.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls a working_dir directly for an already-real conversation id (local backend)", async () => {
    batchGetAppConversations
      .mockResolvedValueOnce([conversation(undefined)])
      .mockResolvedValueOnce([conversation("/workspace/acme-api")]);

    const result = await settle(
      waitForWorkspaceReady("conversation-1", undefined),
    );

    expect(result.workspace?.working_dir).toBe("/workspace/acme-api");
    expect(getStartTask).not.toHaveBeenCalled();
    expect(batchGetAppConversations).toHaveBeenCalledTimes(2);
    expect(batchGetAppConversations).toHaveBeenCalledWith(["conversation-1"]);
  });

  it("resolves the real conversation id from the start task first, then polls its workspace", async () => {
    getStartTask
      .mockResolvedValueOnce(startTask({ status: "WORKING" }))
      .mockResolvedValueOnce(
        startTask({ status: "READY", app_conversation_id: "real-id" }),
      );
    batchGetAppConversations.mockResolvedValueOnce([
      conversation("/workspace/acme-api"),
    ]);

    const result = await settle(waitForWorkspaceReady("task-abc", "task-abc"));

    expect(result.workspace?.working_dir).toBe("/workspace/acme-api");
    expect(batchGetAppConversations).toHaveBeenCalledWith(["real-id"]);
  });

  it("throws the task's own error detail when the start task reports ERROR", async () => {
    getStartTask.mockResolvedValueOnce(
      startTask({ status: "ERROR", detail: "sandbox quota exceeded" }),
    );

    await expect(
      settle(waitForWorkspaceReady("task-abc", "task-abc")),
    ).rejects.toThrow("sandbox quota exceeded");
    expect(batchGetAppConversations).not.toHaveBeenCalled();
  });

  it("times out waiting for the workspace to provision", async () => {
    batchGetAppConversations.mockResolvedValue([conversation(undefined)]);

    await expect(
      settle(waitForWorkspaceReady("conversation-1", undefined)),
    ).rejects.toThrow("Timed out waiting for the workspace to provision.");
  });
});
