import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useMemoryObserver } from "#/hooks/use-memory-observer";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useWorkspaceId } from "#/hooks/use-workspace-id";
import { useEventStore } from "#/stores/use-event-store";
import { submitMemoryCandidate } from "#/lib/workspace-memory";
import type { OpenHandsEvent } from "#/types/agent-server/core";

vi.mock("#/hooks/query/use-active-conversation");
vi.mock("#/hooks/use-workspace-id");
vi.mock("#/lib/workspace-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/lib/workspace-memory")>()),
  submitMemoryCandidate: vi.fn(),
}));

function bashObservation(id: string, command: string): OpenHandsEvent {
  return {
    id,
    timestamp: new Date().toISOString(),
    source: "environment",
    tool_name: "execute_bash",
    tool_call_id: `call-${id}`,
    observation: {
      kind: "ExecuteBashObservation",
      content: [{ type: "text", text: "ok\n" }],
      command,
      exit_code: 0,
      error: false,
      timeout: false,
      metadata: {
        exit_code: 0,
        pid: 1,
        username: "user",
        hostname: "localhost",
        working_dir: "/home/user",
        py_interpreter_path: null,
        prefix: "",
        suffix: "",
      },
    },
    action_id: `action-${id}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/**
 * Regression coverage: `processedCount` used to reset to 0 on every
 * conversation switch, but the event store is repopulated from REST history
 * before this hook's effects run (see the WS provider's preload
 * `useLayoutEffect`s). That made every reopen of a conversation with
 * existing bash-command history resubmit the whole history as "new" memory
 * candidates instead of only genuinely new events.
 */
describe("useMemoryObserver", () => {
  beforeEach(() => {
    vi.mocked(submitMemoryCandidate).mockClear();
    useEventStore.setState({
      events: [],
      eventIds: new Set(),
      uiEvents: [],
      loadedConversationId: null,
    });
    vi.mocked(useWorkspaceId).mockReturnValue("workspace-1");
  });

  it("does not resubmit history already loaded when a conversation is opened", () => {
    vi.mocked(useActiveConversation).mockReturnValue({
      data: { id: "conv-1", selected_repository: undefined },
    } as unknown as ReturnType<typeof useActiveConversation>);

    // Simulate the WS provider having already preloaded this conversation's
    // history into the store by the time this hook's effects run (the
    // common case: cached REST query settling in the same commit).
    useEventStore.setState({
      events: [bashObservation("evt-1", "npm test")],
      eventIds: new Set(["evt-1"]),
    });

    renderHook(() => useMemoryObserver());

    expect(submitMemoryCandidate).not.toHaveBeenCalled();
  });

  it("submits a candidate for a genuinely new event after the conversation loads", () => {
    vi.mocked(useActiveConversation).mockReturnValue({
      data: { id: "conv-1", selected_repository: undefined },
    } as unknown as ReturnType<typeof useActiveConversation>);

    useEventStore.setState({
      events: [bashObservation("evt-1", "npm test")],
      eventIds: new Set(["evt-1"]),
    });

    const { rerender } = renderHook(() => useMemoryObserver());
    expect(submitMemoryCandidate).not.toHaveBeenCalled();

    // A new command actually runs live, after the initial load.
    useEventStore.setState({
      events: [
        bashObservation("evt-1", "npm test"),
        bashObservation("evt-2", "npm run build"),
      ],
      eventIds: new Set(["evt-1", "evt-2"]),
    });
    rerender();

    expect(submitMemoryCandidate).toHaveBeenCalledTimes(1);
    expect(submitMemoryCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "command:npm run build" }),
    );
  });
});
