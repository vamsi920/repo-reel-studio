import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatInputLogic } from "#/hooks/chat/use-chat-input-logic";
import { useConversationStore } from "#/stores/conversation-store";

const { useOptionalConversationIdMock } = vi.hoisted(() => ({
  useOptionalConversationIdMock: vi.fn(),
}));

vi.mock("#/hooks/use-conversation-id", () => ({
  useOptionalConversationId: () => useOptionalConversationIdMock(),
}));

const setChatInputText = (
  result: { current: ReturnType<typeof useChatInputLogic> },
  text: string,
) => {
  if (!result.current.chatInputRef.current) {
    result.current.chatInputRef.current = document.createElement("div");
  }
  // jsdom doesn't compute `.innerText` from layout; getTextContent() reads
  // `.innerText`, so set it directly (matches use-slash-command.test.ts).
  result.current.chatInputRef.current.innerText = text;
};

describe("useChatInputLogic — messageToSend write coordination", () => {
  beforeEach(() => {
    useOptionalConversationIdMock.mockReset();
    useConversationStore.setState({
      messageToSend: null,
      messageRestoreIfEmpty: null,
      hasRightPanelToggled: false,
      isRightPanelShown: false,
    });
  });

  it("does not clobber a just-set messageToSend when conversationId changes (navigation)", () => {
    useOptionalConversationIdMock.mockReturnValue({ conversationId: "conv-1" });
    const { result, rerender } = renderHook(() => useChatInputLogic());

    // Simulate leftover DOM text from before navigation (the composer
    // element isn't remounted per conversation).
    setChatInputText(result, "leftover text from conv-1");

    // Simulate a deferred prefill write landing right after navigate(),
    // e.g. "Branch from here"'s handleBranch onSuccess.
    act(() => {
      useConversationStore.getState().setMessageToSend("branched message");
    });

    useOptionalConversationIdMock.mockReturnValue({ conversationId: "conv-2" });
    act(() => rerender());

    expect(useConversationStore.getState().messageToSend?.text).toBe(
      "branched message",
    );
  });

  it("saves the current input into messageToSend when the drawer toggles within the same conversation", () => {
    useOptionalConversationIdMock.mockReturnValue({ conversationId: "conv-1" });
    const { result, rerender } = renderHook(() => useChatInputLogic());

    setChatInputText(result, "draft in progress");

    act(() => {
      useConversationStore.getState().setHasRightPanelToggled(true);
    });
    act(() => rerender());

    expect(useConversationStore.getState().messageToSend?.text).toBe(
      "draft in progress",
    );
  });

  it("does not save DOM text when conversationId and the drawer toggle change together", () => {
    useOptionalConversationIdMock.mockReturnValue({ conversationId: "conv-1" });
    const { result, rerender } = renderHook(() => useChatInputLogic());

    setChatInputText(result, "leftover text from conv-1");

    act(() => {
      useConversationStore.getState().setMessageToSend("branched message");
    });

    // conversationId and the toggle must change in the SAME render pass to
    // exercise the "combined" guard branch.
    act(() => {
      useOptionalConversationIdMock.mockReturnValue({ conversationId: "conv-2" });
      useConversationStore.getState().setHasRightPanelToggled(true);
      rerender();
    });

    expect(useConversationStore.getState().messageToSend?.text).toBe(
      "branched message",
    );
  });
});
