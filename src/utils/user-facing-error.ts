import {
  getApiErrorBody,
  getApiErrorBodyMessage,
  hasHttpResponseStatus,
} from "./api-error-message";

export const CORS_OR_NETWORK_ERROR_MESSAGE =
  "Disconnected (check URL or network). Check that the backend URL is correct and the backend server is reachable. If the backend is on another origin, check that it allows this frontend origin.";

export const BACKEND_REQUEST_TIMEOUT_MESSAGE =
  "Disconnected (request timed out). Check that the backend URL is correct and reachable.";

const MAX_CAUSE_DEPTH = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectErrorMessages(error: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  let depth = 0;

  while (current !== undefined && current !== null && depth < MAX_CAUSE_DEPTH) {
    if (seen.has(current)) break;
    seen.add(current);

    if (current instanceof Error) {
      if (current.message) messages.push(current.message);
      current = current.cause;
    } else if (typeof current === "string") {
      if (current) messages.push(current);
      break;
    } else if (isRecord(current)) {
      const message = current.message;
      if (typeof message === "string" && message) messages.push(message);
      current = current.cause;
    } else {
      break;
    }

    depth += 1;
  }

  return messages;
}

export function getRawErrorMessage(error: unknown): string | null {
  return collectErrorMessages(error)[0] ?? null;
}

export function isCorsOrNetworkErrorMessage(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();

  return (
    normalized.includes("disconnected (check cors or network)") ||
    normalized.includes("disconnected (check url or network)") ||
    normalized.includes("blocked by cors") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network error") ||
    normalized.includes("load failed") ||
    normalized.includes("networkerror when attempting to fetch resource") ||
    (normalized.includes("cors") && normalized.includes("blocked"))
  );
}

export function isCorsOrNetworkError(error: unknown): boolean {
  // A response with an HTTP status came back, so the backend was reached;
  // its body may legitimately contain "failed to fetch" (e.g. FastAPI's
  // "Failed to fetch plugin source") without that being a network failure.
  if (hasHttpResponseStatus(error)) return false;
  return collectErrorMessages(error).some(isCorsOrNetworkErrorMessage);
}

export function isBackendRequestTimeoutMessage(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("request timeout") ||
    normalized.includes("timeout after") ||
    normalized.includes("backend request timed out")
  );
}

export function getUserFacingConnectionErrorMessage(
  error: unknown,
): string | null {
  const messages = collectErrorMessages(error);
  if (hasHttpResponseStatus(error)) {
    // Real HTTP response: prefer the server's own reason over the transport
    // wrapper ("HTTP request failed (400 Bad Request): {...}") and never
    // reclassify it as a connectivity problem.
    return (
      getApiErrorBodyMessage(getApiErrorBody(error)) ?? messages[0] ?? null
    );
  }
  if (messages.some(isCorsOrNetworkErrorMessage)) {
    return CORS_OR_NETWORK_ERROR_MESSAGE;
  }
  if (messages.some(isBackendRequestTimeoutMessage)) {
    return BACKEND_REQUEST_TIMEOUT_MESSAGE;
  }
  return messages[0] ?? null;
}
