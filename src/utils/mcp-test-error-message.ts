import type { TFunction } from "i18next";
import { I18nKey } from "#/i18n/declaration";
import type { ExtendedMCPTestFailureKind } from "#/types/mcp-server";

// httpx's HTTPStatusError repr: "Client error '410 Gone' for url 'https://…'".
const HTTP_STATUS_ERROR_PATTERN =
  /^(?:Client|Server) error '(\d{3}[^']*)' for url '([^']+)'/;
// Leading Python exception class, e.g. "HTTPStatusError: " / "ConnectError: ".
const EXCEPTION_CLASS_PREFIX = /^[A-Z][A-Za-z0-9_]*(?:Error|Exception):\s*/;
// httpx appends an MDN pointer that means nothing to an MCP user.
const MDN_TRAILER = /\s*For more information check:\s*\S+\s*$/;

/**
 * Turns the backend's raw exception text into a sentence: drops the
 * exception class name and the MDN trailer, and renders httpx's status
 * errors as "The server answered 410 Gone for <url>".
 */
export function makeUnknownMcpTestErrorMessage(
  t: TFunction<"openhands">,
  error: string,
): string {
  let text = error.replace(MDN_TRAILER, "").trim();
  while (EXCEPTION_CLASS_PREFIX.test(text)) {
    text = text.replace(EXCEPTION_CLASS_PREFIX, "");
  }
  const statusMatch = HTTP_STATUS_ERROR_PATTERN.exec(text);
  if (statusMatch) {
    return t(I18nKey.MCP$TEST_ERROR_HTTP_STATUS, {
      status: statusMatch[1],
      url: statusMatch[2],
    });
  }
  return t(I18nKey.MCP$TEST_ERROR_UNKNOWN, { error: text || error });
}

/**
 * Kind-specific, localized guidance for a failed MCP connection test.
 * `error` is interpolated for the kinds whose message surfaces the provider
 * detail — callers pass display-safe (redacted) text.
 */
export function makeMcpTestErrorMessage(
  t: TFunction<"openhands">,
  errorKind: ExtendedMCPTestFailureKind,
  error: string,
): string {
  switch (errorKind) {
    case "timeout":
      return t(I18nKey.MCP$TEST_ERROR_TIMEOUT);
    case "connection":
      return t(I18nKey.MCP$TEST_ERROR_CONNECTION);
    case "credentials":
      return t(I18nKey.MCP$TEST_ERROR_CREDENTIALS, { error });
    default:
      return makeUnknownMcpTestErrorMessage(t, error);
  }
}
