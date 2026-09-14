import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useForkConversation } from "#/hooks/mutation/use-fork-conversation";

const renderForkHook = () => {
  const queryClient = new QueryClient();
  return renderHook(() => useForkConversation(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    ),
  });
};

describe("useForkConversation", () => {
  it("branches inclusively and does not prefill when no editText is given", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "forkConversation",
    ).mockResolvedValue({ id: "fork-1", leaf_event_id: "event-1" } as never);

    const { result } = renderForkHook();

    const outcome = await result.current.mutateAsync({
      sourceConversationId: "conv-1",
      eventId: "event-1",
    });

    expect(outcome.excluded).toBe(false);
    expect(AgentServerConversationService.forkConversation).toHaveBeenCalledWith(
      "conv-1",
      "event-1",
      undefined,
    );
  });

  it("excludes the message and prefills when it has a resolvable parent", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "getEventParentId",
    ).mockResolvedValue("parent-1");
    vi.spyOn(
      AgentServerConversationService,
      "forkConversation",
    ).mockResolvedValue({
      id: "fork-1",
      leaf_event_id: "parent-1",
    } as never);

    const { result } = renderForkHook();

    const outcome = await result.current.mutateAsync({
      sourceConversationId: "conv-1",
      eventId: "event-2",
      editText: "hello",
    });

    expect(outcome.excluded).toBe(true);
    expect(AgentServerConversationService.forkConversation).toHaveBeenCalledWith(
      "conv-1",
      "parent-1",
      undefined,
    );
  });

  it("does not prefill when an older agent-server ignores from_event_id and copies everything", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "getEventParentId",
    ).mockResolvedValue("parent-1");
    vi.spyOn(
      AgentServerConversationService,
      "forkConversation",
    ).mockResolvedValue({
      id: "fork-1",
      leaf_event_id: "some-later-event",
    } as never);

    const { result } = renderForkHook();

    const outcome = await result.current.mutateAsync({
      sourceConversationId: "conv-1",
      eventId: "event-2",
      editText: "hello",
    });

    expect(outcome.excluded).toBe(false);
  });

  it("prefills the root message when the agent-server drops it from an otherwise-empty fork", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "getEventParentId",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      AgentServerConversationService,
      "forkConversation",
    ).mockResolvedValue({ id: "fork-1", leaf_event_id: null } as never);

    const { result } = renderForkHook();

    const outcome = await result.current.mutateAsync({
      sourceConversationId: "conv-1",
      eventId: "root-event",
      editText: "first message",
    });

    expect(outcome.excluded).toBe(true);
    expect(AgentServerConversationService.forkConversation).toHaveBeenCalledWith(
      "conv-1",
      "root-event",
      undefined,
    );
  });

  it("does not prefill the root message when the agent-server correctly keeps it as the fork's HEAD", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "getEventParentId",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      AgentServerConversationService,
      "forkConversation",
    ).mockResolvedValue({
      id: "fork-1",
      leaf_event_id: "root-event",
    } as never);

    const { result } = renderForkHook();

    const outcome = await result.current.mutateAsync({
      sourceConversationId: "conv-1",
      eventId: "root-event",
      editText: "first message",
    });

    expect(outcome.excluded).toBe(false);
  });

  it("invalidates the conversation list on success", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "forkConversation",
    ).mockResolvedValue({ id: "fork-1", leaf_event_id: "event-1" } as never);

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useForkConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({
      sourceConversationId: "conv-1",
      eventId: "event-1",
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["user", "conversations"],
      });
    });
  });
});
