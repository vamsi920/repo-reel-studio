/**
 * Regression test: useStartTasks used to be a hardcoded stub
 * (`queryFn: () => []`) that never called the backend, so the sidebar's
 * "provisioning" cards for in-progress cloud conversations never appeared
 * even though the rest of the system (use-create-conversation's cache
 * invalidation, ConversationPanel's rendering) was wired as if it worked.
 *
 * Per the testing rules we exercise the real hook and mock only the
 * underlying service (AgentServerConversationService.searchStartTasks).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useStartTasks } from "#/hooks/query/use-start-tasks";
import type { AppConversationStartTask } from "#/api/conversation-service/agent-server-conversation-service.types";

const { searchStartTasksMock, useActiveBackendMock } = vi.hoisted(() => ({
  searchStartTasksMock: vi.fn(),
  useActiveBackendMock: vi.fn(),
}));

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({
    default: {
      searchStartTasks: (...args: unknown[]) => searchStartTasksMock(...args),
    },
  }),
);

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const makeTask = (
  id: string,
  status: AppConversationStartTask["status"],
): AppConversationStartTask => ({
  id,
  created_by_user_id: null,
  status,
  detail: null,
  app_conversation_id: null,
  agent_server_url: null,
  request: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

describe("useStartTasks", () => {
  beforeEach(() => {
    searchStartTasksMock.mockReset();
    useActiveBackendMock.mockReset();
    useActiveBackendMock.mockReturnValue({
      backend: { id: "cloud-1", kind: "cloud" },
      orgId: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls the real service instead of always returning an empty array", async () => {
    searchStartTasksMock.mockResolvedValue([makeTask("task-1", "WORKING")]);

    const { result } = renderHook(() => useStartTasks(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });
    expect(searchStartTasksMock).toHaveBeenCalledWith(10);
    expect(result.current.data?.[0].id).toBe("task-1");
  });

  it("filters out READY and ERROR tasks so only in-progress tasks are surfaced", async () => {
    searchStartTasksMock.mockResolvedValue([
      makeTask("task-working", "WORKING"),
      makeTask("task-ready", "READY"),
      makeTask("task-error", "ERROR"),
      makeTask("task-preparing", "PREPARING_REPOSITORY"),
    ]);

    const { result } = renderHook(() => useStartTasks(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(2);
    });
    expect(result.current.data?.map((task) => task.id)).toEqual([
      "task-working",
      "task-preparing",
    ]);
  });

  it("scopes its cache to the active backend and org so switching accounts refetches", async () => {
    searchStartTasksMock.mockResolvedValue([makeTask("task-1", "WORKING")]);

    const { result, rerender } = renderHook(() => useStartTasks(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    useActiveBackendMock.mockReturnValue({
      backend: { id: "cloud-2", kind: "cloud" },
      orgId: "org-2",
    });
    searchStartTasksMock.mockResolvedValue([]);
    rerender();

    await waitFor(() => {
      expect(result.current.data).toHaveLength(0);
    });
    expect(searchStartTasksMock).toHaveBeenCalledTimes(2);
  });
});
