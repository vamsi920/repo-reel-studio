import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import { useChatInputEvents } from "#/hooks/chat/use-chat-input-events";
import { useConversationStore } from "#/stores/conversation-store";

const makeEnterKeyEvent = (
  overrides: Partial<React.KeyboardEvent> = {},
): React.KeyboardEvent =>
  ({
    key: "Enter",
    shiftKey: false,
    nativeEvent: { isComposing: false } as unknown as KeyboardEvent,
    preventDefault: vi.fn(),
    ...overrides,
  }) as unknown as React.KeyboardEvent;

const setupHook = (checkIsContentEmpty: () => boolean) => {
  const increaseHeightForEmptyContent = vi.fn();
  const handleSubmit = vi.fn();
  const { result } = renderHook(() =>
    useChatInputEvents(
      { current: document.createElement("div") },
      vi.fn(),
      increaseHeightForEmptyContent,
      checkIsContentEmpty,
      vi.fn(),
    ),
  );
  return { result, increaseHeightForEmptyContent, handleSubmit };
};

describe("useChatInputEvents — handleKeyDown Enter submission", () => {
  beforeEach(() => {
    useConversationStore.setState({ images: [], files: [] });
  });

  it("submits on Enter when the input has text", () => {
    const { result, handleSubmit, increaseHeightForEmptyContent } =
      setupHook(() => false);

    result.current.handleKeyDown(makeEnterKeyEvent(), false, handleSubmit);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(increaseHeightForEmptyContent).not.toHaveBeenCalled();
  });

  it("does not submit and just grows the box on Enter when there's no text and no attachments", () => {
    const { result, handleSubmit, increaseHeightForEmptyContent } =
      setupHook(() => true);

    result.current.handleKeyDown(makeEnterKeyEvent(), false, handleSubmit);

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(increaseHeightForEmptyContent).toHaveBeenCalledTimes(1);
  });

  it("still submits on Enter when the text is empty but images are attached", () => {
    useConversationStore.setState({
      images: [new File(["x"], "screenshot.png", { type: "image/png" })],
      files: [],
    });
    const { result, handleSubmit, increaseHeightForEmptyContent } =
      setupHook(() => true);

    result.current.handleKeyDown(makeEnterKeyEvent(), false, handleSubmit);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(increaseHeightForEmptyContent).not.toHaveBeenCalled();
  });

  it("still submits on Enter when the text is empty but files are attached", () => {
    useConversationStore.setState({
      images: [],
      files: [new File(["x"], "notes.txt", { type: "text/plain" })],
    });
    const { result, handleSubmit, increaseHeightForEmptyContent } =
      setupHook(() => true);

    result.current.handleKeyDown(makeEnterKeyEvent(), false, handleSubmit);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(increaseHeightForEmptyContent).not.toHaveBeenCalled();
  });
});
