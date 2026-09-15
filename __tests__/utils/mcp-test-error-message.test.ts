import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { makeMcpTestErrorMessage } from "#/utils/mcp-test-error-message";

// Mirrors the vitest i18n mock: the key comes back as-is, with the
// interpolation values appended so the test can see what was passed.
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as TFunction<"openhands">;

describe("makeMcpTestErrorMessage", () => {
  it("renders an httpx status error as a status + URL sentence", () => {
    const raw =
      "HTTPStatusError: Client error '410 Gone' for url 'https://mcp.deepwiki.com/sse'\n" +
      "For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/410";

    const message = makeMcpTestErrorMessage(t, "unknown", raw);

    expect(message).toBe(
      'MCP$TEST_ERROR_HTTP_STATUS {"status":"410 Gone","url":"https://mcp.deepwiki.com/sse"}',
    );
  });

  it("strips the exception class and MDN trailer from other errors", () => {
    const raw =
      "ConnectError: All connection attempts failed\n" +
      "For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/502";

    const message = makeMcpTestErrorMessage(t, "unknown", raw);

    expect(message).toBe(
      'MCP$TEST_ERROR_UNKNOWN {"error":"All connection attempts failed"}',
    );
  });
});
