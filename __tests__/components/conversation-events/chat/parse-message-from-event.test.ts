import { describe, expect, it } from "vitest";
import { parseMessageFromEvent } from "#/components/conversation-events/chat/event-content-helpers/parse-message-from-event";
import { MEMORY_BLOCK_END, MEMORY_BLOCK_START } from "#/lib/workspace-memory";
import type { MessageEvent } from "#/types/agent-server/core";

function userMessage(text: string, source = "user") {
  return {
    source,
    llm_message: { role: "user", content: [{ type: "text", text }] },
  } as unknown as MessageEvent;
}

describe("parseMessageFromEvent", () => {
  it("hides injected memory and KT context from the user's own message", () => {
    const text = `${MEMORY_BLOCK_START}\n- fact\n${MEMORY_BLOCK_END}\n\n<KT_DOCS>\n- Payments\n</KT_DOCS>\n\nFix the checkout bug`;

    expect(parseMessageFromEvent(userMessage(text))).toBe(
      "Fix the checkout bug",
    );
  });

  it("leaves agent messages untouched", () => {
    const text = "<KT_DOCS>quoted</KT_DOCS> reply";

    expect(parseMessageFromEvent(userMessage(text, "agent"))).toBe(text);
  });
});
