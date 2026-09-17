import { describe, expect, it } from "vitest";
import { I18nKey } from "#/i18n/declaration";
import {
  getAcpErrorHeaderKey,
  isAcpAuthErrorCode,
} from "#/utils/acp-error-codes";

describe("acp-error-codes", () => {
  it("maps the auth code to the auth header key", () => {
    expect(getAcpErrorHeaderKey("ACPAuthRequired")).toBe(
      I18nKey.ERROR$ACP_AUTH_REQUIRED_TITLE,
    );
  });

  it("maps other ACP codes to the generic agent-error header", () => {
    for (const code of [
      "ACPSpawnError",
      "ACPInitError",
      "ACPPromptError",
      "UsagePolicyRefusal",
    ]) {
      expect(getAcpErrorHeaderKey(code)).toBe(
        I18nKey.CHAT_INTERFACE$AGENT_ERROR_MESSAGE,
      );
    }
  });

  it("maps rate-limit and unavailability codes to their own headers", () => {
    expect(getAcpErrorHeaderKey("LLMRateLimitError")).toBe(
      I18nKey.ERROR$LLM_RATE_LIMITED_TITLE,
    );
    expect(getAcpErrorHeaderKey("LLMServiceUnavailableError")).toBe(
      I18nKey.ERROR$LLM_UNAVAILABLE_TITLE,
    );
    expect(getAcpErrorHeaderKey("LLMTimeoutError")).toBe(
      I18nKey.ERROR$LLM_UNAVAILABLE_TITLE,
    );
  });

  it("maps other litellm-originated codes to the generic agent-error header", () => {
    for (const code of [
      "LLMAuthenticationError",
      "LLMBadRequestError",
      "LLMContextWindowExceedError",
    ]) {
      expect(getAcpErrorHeaderKey(code)).toBe(
        I18nKey.CHAT_INTERFACE$AGENT_ERROR_MESSAGE,
      );
    }
  });

  it("returns null for unknown, empty, or missing codes", () => {
    expect(getAcpErrorHeaderKey(null)).toBeNull();
    expect(getAcpErrorHeaderKey(undefined)).toBeNull();
    expect(getAcpErrorHeaderKey("")).toBeNull();
    expect(getAcpErrorHeaderKey("RequestError")).toBeNull();
  });

  it("flags only the auth code for re-authentication", () => {
    expect(isAcpAuthErrorCode("ACPAuthRequired")).toBe(true);
    expect(isAcpAuthErrorCode("ACPPromptError")).toBe(false);
    expect(isAcpAuthErrorCode(null)).toBe(false);
    expect(isAcpAuthErrorCode(undefined)).toBe(false);
  });
});
