import axios from "axios";

/**
 * Extract the parsed response body from a failed API call.
 *
 * Handles both transports the app uses: local agent-server calls that
 * throw an `AxiosError` (body under `error.response.data`) and cloud
 * calls through the shared TypeScript client that throw an `HttpError`
 * (parsed body directly under `error.response`).
 */
export function getApiErrorBody(error: unknown): unknown {
  if (axios.isAxiosError(error)) return error.response?.data;
  if (error instanceof Error && "response" in error) {
    return (error as { response?: unknown }).response;
  }
  return undefined;
}

/**
 * Pull the server-provided reason out of a parsed error body. Reads the
 * `message` / `detail` / `error` fields (FastAPI's default validation shape
 * is `{"detail": "..."}`), so callers never surface the raw JSON blob.
 */
export function getApiErrorBodyMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const { message, detail, error } = body as {
    message?: unknown;
    detail?: unknown;
    error?: unknown;
  };
  if (typeof message === "string" && message) return message;
  if (typeof detail === "string" && detail) return detail;
  if (typeof error === "string" && error) return error;
  return null;
}

/**
 * Whether a failed call actually reached the server and got an HTTP status
 * back — an SDK `HttpError` (numeric `status` on the error) or an
 * `AxiosError` with a `response`. Such errors are, by definition, not
 * network / CORS failures, whatever their body text happens to say.
 */
export function hasHttpResponseStatus(error: unknown): boolean {
  return getHttpResponseStatus(error) !== undefined;
}

/**
 * The HTTP status the server answered with, or `undefined` when the call
 * never got a response (network / CORS failure, non-HTTP error).
 */
export function getHttpResponseStatus(error: unknown): number | undefined {
  const status = axios.isAxiosError(error)
    ? error.response?.status
    : error instanceof Error
      ? (error as { status?: unknown }).status
      : undefined;
  // Some clients report a failed connection as status 0; only a real
  // response status counts.
  return typeof status === "number" && status > 0 ? status : undefined;
}

/**
 * Whether the server answered with a client error that retrying the same
 * request cannot fix. 408 (timeout) and 429 (rate limit) are the two 4xx
 * codes that are transient by definition, so they stay retryable.
 */
export function isNonRetryableClientError(error: unknown): boolean {
  const status = getHttpResponseStatus(error);
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

/**
 * Extract a human-readable message from a failed API call. Prefers the
 * server-provided `message`/`detail` fields, then the `Error` message,
 * then `fallback`.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const bodyMessage = getApiErrorBodyMessage(getApiErrorBody(error));
  if (bodyMessage) return bodyMessage;

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
