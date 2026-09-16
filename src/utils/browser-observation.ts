import type { BrowserObservation } from "#/types/agent-server/core/base/observation";

/**
 * The text the browser tool returned, joined the same way the chat panel
 * joins it. The agent-server sends a TextContent list; `output` is the legacy
 * single-string shape and is only consulted when no list is present.
 */
export function getBrowserObservationText(
  observation: BrowserObservation,
): string {
  if (Array.isArray(observation.content)) {
    return observation.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }
  return observation.output || "";
}

export function isBrowserObservationError(
  observation: BrowserObservation,
): boolean {
  return Boolean(observation.error) || observation.is_error === true;
}

// `browser_get_content` returns "<url>\n<current url>\n</url>\n<content>…"
// (see openhands.tools.browser_use.server._get_content).
const GET_CONTENT_URL_PATTERN = /^\s*<url>\s*([^\s<]+)\s*<\/url>/;

/**
 * The URL the browser itself reports it is showing, from an observation that
 * describes actual browser state rather than the agent's intent:
 *
 * - `browser_get_state` returns a JSON object with `url` / `title` / `tabs`
 *   (screenshot only when the agent asked for one);
 * - `browser_get_content` returns the current URL in a leading `<url>` block.
 *
 * A `browser_navigate` observation ("Navigated to: …") is deliberately *not*
 * parsed: that is the tool echoing the requested URL, and it is emitted even
 * when the browser silently never moved (the case b74e108 guards against).
 *
 * Returns null when the observation is an error or carries no reported URL.
 */
export function getReportedBrowserUrl(
  observation: BrowserObservation,
): string | null {
  if (isBrowserObservationError(observation)) {
    return null;
  }
  const text = getBrowserObservationText(observation).trim();
  if (!text) {
    return null;
  }

  if (text.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { url?: unknown }).url === "string"
      ) {
        const { url } = parsed as { url: string };
        return url.trim() || null;
      }
    } catch {
      // Not the get_state JSON payload; fall through.
    }
    return null;
  }

  const match = GET_CONTENT_URL_PATTERN.exec(text);
  return match ? match[1] : null;
}
