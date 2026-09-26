import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionEvent } from "#/types/agent-server/core/events/action-event";
import type { Action } from "#/types/agent-server/core/base/action";
import { handleActionEventCacheInvalidation } from "#/utils/cache-utils";
import { useModelStore } from "#/stores/model-store";

const makeActionEvent = (overrides: Partial<ActionEvent>): ActionEvent =>
  ({
    id: "ev-1",
    timestamp: new Date().toISOString(),
    source: "agent",
    tool_name: "SwitchLLMTool",
    tool_call_id: "call-1",
    action: { kind: "SwitchLLMAction" },
    ...overrides,
  }) as unknown as ActionEvent;

describe("handleActionEventCacheInvalidation", () => {
  beforeEach(() => {
    useModelStore.setState({
      entriesByConversation: {},
      activeProfileByConversation: {},
    });
  });

  it("refreshes the conversation and drops the optimistic profile when SwitchLLMTool fires", () => {
    useModelStore.setState({
      activeProfileByConversation: { "conv-1": "haiku" },
    });
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    handleActionEventCacheInvalidation(
      makeActionEvent({ tool_name: "SwitchLLMTool" }),
      "conv-1",
      queryClient,
    );

    expect(spy).toHaveBeenCalledWith({
      queryKey: ["user", "conversation", "conv-1"],
    });
    expect(
      useModelStore.getState().activeProfileByConversation["conv-1"],
    ).toBeUndefined();
  });

  it("does not touch the conversation cache for unrelated tool events", () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    handleActionEventCacheInvalidation(
      makeActionEvent({ tool_name: "terminal" }),
      "conv-1",
      queryClient,
    );

    const conversationInvalidations = spy.mock.calls.filter(
      ([arg]) =>
        Array.isArray((arg as { queryKey?: unknown[] })?.queryKey) &&
        (arg as { queryKey: unknown[] }).queryKey[0] === "user",
    );
    expect(conversationInvalidations).toHaveLength(0);
  });

  it.each([
    ["StrReplaceEditorAction", { kind: "StrReplaceEditorAction" } as Action],
    ["FileEditorAction", { kind: "FileEditorAction" } as Action],
    ["ExecuteBashAction", { kind: "ExecuteBashAction" } as Action],
    // Regression: the current-SDK terminal-tool kind used to be missing
    // from this list, so shell commands run through it never invalidated
    // the Files tab's diff/tree caches.
    ["TerminalAction", { kind: "TerminalAction" } as Action],
  ] as const)(
    "invalidates file_changes and workspace-files for a %s",
    (_label, action) => {
      const queryClient = new QueryClient();
      const spy = vi.spyOn(queryClient, "invalidateQueries");

      handleActionEventCacheInvalidation(
        makeActionEvent({ tool_name: "terminal", action }),
        "conv-1",
        queryClient,
      );

      expect(spy).toHaveBeenCalledWith(
        { queryKey: ["file_changes", "conv-1"] },
        { cancelRefetch: false },
      );
      expect(spy).toHaveBeenCalledWith(
        { queryKey: ["workspace-files"] },
        { cancelRefetch: false },
      );
    },
  );

  it("does not invalidate file_changes or workspace-files for an unrelated action kind", () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    handleActionEventCacheInvalidation(
      makeActionEvent({
        action: { kind: "ThinkAction", thought: "hmm" } as Action,
      }),
      "conv-1",
      queryClient,
    );

    const fileInvalidations = spy.mock.calls.filter(([arg]) => {
      const key = (arg as { queryKey?: unknown[] })?.queryKey;
      return (
        Array.isArray(key) &&
        (key[0] === "file_changes" || key[0] === "workspace-files")
      );
    });
    expect(fileInvalidations).toHaveLength(0);
  });
});
