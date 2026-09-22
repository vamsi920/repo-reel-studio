import { describe, expect, it } from "vitest";
import type { ErrorClassification } from "@openhands/typescript-client";
import { I18nKey } from "#/i18n/declaration";
import { getAgentErrorHeaderKey } from "#/utils/agent-error-classification";

function classification(
  kind: ErrorClassification["kind"],
): ErrorClassification {
  return { kind, retryable: false };
}

describe("agent-error-classification", () => {
  it("maps auth to the auth header key", () => {
    expect(getAgentErrorHeaderKey(classification("auth"))).toBe(
      I18nKey.ERROR$ACP_AUTH_REQUIRED_TITLE,
    );
  });

  it("maps quota and rate_limit to the shared rate-limit header key", () => {
    expect(getAgentErrorHeaderKey(classification("quota"))).toBe(
      I18nKey.ERROR$LLM_RATE_LIMITED_TITLE,
    );
    expect(getAgentErrorHeaderKey(classification("rate_limit"))).toBe(
      I18nKey.ERROR$LLM_RATE_LIMITED_TITLE,
    );
  });

  it("maps transient to the unavailable header key", () => {
    expect(getAgentErrorHeaderKey(classification("transient"))).toBe(
      I18nKey.ERROR$LLM_UNAVAILABLE_TITLE,
    );
  });

  it("maps kinds with no dedicated copy to the generic agent-error header", () => {
    for (const kind of [
      "config",
      "agent_action",
      "internal",
      "unknown",
    ] as const) {
      expect(getAgentErrorHeaderKey(classification(kind))).toBe(
        I18nKey.CHAT_INTERFACE$AGENT_ERROR_MESSAGE,
      );
    }
  });

  it("falls back to the generic header when classification is missing", () => {
    expect(getAgentErrorHeaderKey(null)).toBe(
      I18nKey.CHAT_INTERFACE$AGENT_ERROR_MESSAGE,
    );
    expect(getAgentErrorHeaderKey(undefined)).toBe(
      I18nKey.CHAT_INTERFACE$AGENT_ERROR_MESSAGE,
    );
  });
});
