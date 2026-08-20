/**
 * Injection is the moment workspace memory becomes visible to an agent, so the
 * contract is checked precisely: the user's own text must survive byte for
 * byte, and a resend must never stack a second block.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MEMORY_BLOCK_START } from "#/lib/workspace-memory";

const sendMessage = vi.fn(async () => ({ queued: false }));
const buildMemoryContext = vi.fn<(task: string) => string>(() => "");

vi.mock("#/contexts/conversation-websocket-context", () => ({
  useConversationWebSocket: () => ({ sendMessage }),
}));

vi.mock("#/hooks/use-conversation-id", () => ({
  useOptionalConversationId: () => ({ conversationId: "conv-1" }),
}));

vi.mock("#/hooks/use-workspace-memory-context", () => ({
  useWorkspaceMemoryContext: () => buildMemoryContext,
}));

import { useSendMessage } from "./use-send-message";

const MEMORY_BLOCK = `${MEMORY_BLOCK_START}\n## Workspace memory\n- **fact**: Payments moved to gRPC.\n<!-- neodevex:workspace-memory:end -->`;

function lastCall<T>(): T {
  const calls = sendMessage.mock.calls;
  if (calls.length === 0) throw new Error("sendMessage was never called");
  return calls[calls.length - 1] as unknown as T;
}

function sentText(): string {
  const [message] =
    lastCall<[{ content: Array<{ type: string; text?: string }> }]>();
  return message.content[0].text ?? "";
}

beforeEach(() => {
  sendMessage.mockClear();
  buildMemoryContext.mockReset();
  buildMemoryContext.mockReturnValue("");
});

describe("useSendMessage", () => {
  it("prepends the memory block above the user's text", async () => {
    buildMemoryContext.mockReturnValue(MEMORY_BLOCK);
    const { result } = renderHook(() => useSendMessage());

    await result.current.send({
      action: "message",
      args: { content: "how does payments talk to billing?" },
    });

    const text = sentText();
    expect(text.startsWith(MEMORY_BLOCK_START)).toBe(true);
    expect(text.endsWith("how does payments talk to billing?")).toBe(true);
    expect(text).toBe(`${MEMORY_BLOCK}\n\nhow does payments talk to billing?`);
  });

  it("passes the message through untouched when there is no memory", async () => {
    const { result } = renderHook(() => useSendMessage());

    await result.current.send({
      action: "message",
      args: { content: "how does payments talk to billing?" },
    });

    expect(sentText()).toBe("how does payments talk to billing?");
  });

  it("never injects twice into a resend", async () => {
    buildMemoryContext.mockReturnValue(MEMORY_BLOCK);
    const { result } = renderHook(() => useSendMessage());

    const resent = `${MEMORY_BLOCK}\n\nhow does payments talk to billing?`;
    await result.current.send({
      action: "message",
      args: { content: resent },
    });

    expect(sentText()).toBe(resent);
    expect(buildMemoryContext).not.toHaveBeenCalled();
  });

  it("keeps images alongside the injected text", async () => {
    buildMemoryContext.mockReturnValue(MEMORY_BLOCK);
    const { result } = renderHook(() => useSendMessage());

    await result.current.send({
      action: "message",
      args: {
        content: "look at this",
        image_urls: ["data:image/png;base64,x"],
      },
    });

    const [message] = lastCall<[{ content: Array<{ type: string }> }]>();
    expect(message.content.map((part) => part.type)).toEqual(["text", "image"]);
  });
});
