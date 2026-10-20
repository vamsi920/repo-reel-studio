import { describe, expect, it } from "vitest";
import { isOnboardingReceiptEvent } from "#/utils/onboarding-receipt";
import type { OpenHandsEvent } from "#/types/agent-server/core";

const message = (role: "user" | "assistant", text: string) =>
  ({
    id: `${role}-${text.length}`,
    timestamp: "2026-10-13T00:00:00.000Z",
    source: role === "user" ? "user" : "agent",
    kind: "MessageEvent",
    llm_message: { role, content: [{ type: "text", text }] },
  }) as unknown as OpenHandsEvent;

describe("onboarding receipts in the setup chat", () => {
  it("hides the app's receipt and the agent repeating one", () => {
    expect(
      isOnboardingReceiptEvent(
        message("user", '[onboarding result] {"status":"ok"}'),
      ),
    ).toBe(true);
    expect(
      isOnboardingReceiptEvent(
        message("assistant", '[onboarding result] {"status":"form_opened"}'),
      ),
    ).toBe(true);
  });

  it("keeps ordinary conversation", () => {
    expect(
      isOnboardingReceiptEvent(
        message("assistant", "Which tracker do you use?"),
      ),
    ).toBe(false);
  });
});
