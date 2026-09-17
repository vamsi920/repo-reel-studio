import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUnifiedGetGitChanges } from "#/hooks/query/use-unified-get-git-changes";
import AgentServerGitService from "#/api/git-service/agent-server-git-service.api";
import type { GitChange } from "#/api/open-hands.types";

const useConversationIdMock = vi.fn();
vi.mock("#/hooks/use-conversation-id", () => ({
  useConversationId: () => useConversationIdMock(),
}));

const useActiveConversationMock = vi.fn();
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

vi.mock("#/hooks/use-runtime-is-ready", () => ({
  useRuntimeIsReady: () => true,
}));

const getGitChangesSpy = vi.spyOn(AgentServerGitService, "getGitChanges");

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function GitChangesTestWrapper({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function conversationFor(id: string) {
  return {
    id,
    conversation_url: `https://runtime.example.com/api/conversations/${id}`,
    session_api_key: "session-key",
    selected_repository: "org/repo",
    workspace: { working_dir: "/workspace/project" },
  };
}

beforeEach(() => {
  useConversationIdMock.mockReset();
  useActiveConversationMock.mockReset();
  getGitChangesSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useUnifiedGetGitChanges", () => {
  it("clears the previous conversation's changes the moment conversationId changes", async () => {
    const changesA: GitChange[] = [{ status: "M", path: "shared.txt" }];
    const changesB: GitChange[] = [{ status: "A", path: "only-in-b.txt" }];

    useConversationIdMock.mockReturnValue({ conversationId: "conv-a" });
    useActiveConversationMock.mockReturnValue({
      data: conversationFor("conv-a"),
    });
    getGitChangesSpy.mockResolvedValueOnce(changesA);

    const { result, rerender } = renderHook(() => useUnifiedGetGitChanges(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(changesA));

    // Switch conversations without remounting the hook — the Files/Changes
    // tab stays mounted across a conversation switch in the real app.
    let resolveB: (value: GitChange[]) => void = () => {};
    getGitChangesSpy.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveB = resolve;
      }),
    );
    useConversationIdMock.mockReturnValue({ conversationId: "conv-b" });
    useActiveConversationMock.mockReturnValue({
      data: conversationFor("conv-b"),
    });
    rerender();

    // Conversation A's changes must never leak into conversation B's view,
    // even while B's own fetch is still in flight.
    expect(result.current.data).toEqual([]);

    resolveB(changesB);
    await waitFor(() => expect(result.current.data).toEqual(changesB));

    // A path that happens to exist in both conversations must reflect B's
    // fresh status, never A's stale cached object for that same path.
    expect(
      result.current.data.find((change) => change.path === "shared.txt"),
    ).toBeUndefined();
  });

  it("keeps ordering newest changes on top within the same conversation", async () => {
    useConversationIdMock.mockReturnValue({ conversationId: "conv-a" });
    useActiveConversationMock.mockReturnValue({
      data: conversationFor("conv-a"),
    });

    getGitChangesSpy.mockResolvedValueOnce([
      { status: "M", path: "a.txt" },
    ] as GitChange[]);

    const { result, rerender } = renderHook(() => useUnifiedGetGitChanges(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() =>
      expect(result.current.data).toEqual([{ status: "M", path: "a.txt" }]),
    );

    getGitChangesSpy.mockResolvedValueOnce([
      { status: "M", path: "a.txt" },
      { status: "A", path: "b.txt" },
    ] as GitChange[]);
    result.current.refetch();
    rerender();

    await waitFor(() =>
      expect(result.current.data).toEqual([
        { status: "A", path: "b.txt" },
        { status: "M", path: "a.txt" },
      ]),
    );
  });
});
