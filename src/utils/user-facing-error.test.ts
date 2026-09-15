import { describe, expect, it } from "vitest";
import { HttpError } from "@openhands/typescript-client";
import {
  BACKEND_REQUEST_TIMEOUT_MESSAGE,
  CORS_OR_NETWORK_ERROR_MESSAGE,
  getUserFacingConnectionErrorMessage,
  isCorsOrNetworkError,
  isCorsOrNetworkErrorMessage,
} from "./user-facing-error";

describe("user-facing connection errors", () => {
  it("maps browser fetch failures to the CORS or network message", () => {
    expect(
      getUserFacingConnectionErrorMessage(
        new Error("Request failed: Failed to fetch"),
      ),
    ).toBe(CORS_OR_NETWORK_ERROR_MESSAGE);
  });

  it("looks through wrapped causes from fetch-based clients", () => {
    expect(
      getUserFacingConnectionErrorMessage(
        new Error("Request failed", {
          cause: new TypeError("Failed to fetch"),
        }),
      ),
    ).toBe(CORS_OR_NETWORK_ERROR_MESSAGE);
  });

  it("detects existing CORS or network labels", () => {
    expect(isCorsOrNetworkErrorMessage(CORS_OR_NETWORK_ERROR_MESSAGE)).toBe(
      true,
    );
  });

  it("maps request timeouts to a backend timeout message", () => {
    expect(
      getUserFacingConnectionErrorMessage(
        new Error("Request timeout after 5000ms"),
      ),
    ).toBe(BACKEND_REQUEST_TIMEOUT_MESSAGE);
  });

  it("leaves ordinary server errors intact", () => {
    expect(
      getUserFacingConnectionErrorMessage(new Error("Invalid API key")),
    ).toBe("Invalid API key");
  });

  it("does not treat a real HTTP response whose body says 'failed to fetch' as a network failure", () => {
    // The agent server answered 400 with FastAPI's `{"detail": ...}`; the
    // shared client wraps it as `HTTP request failed (400 Bad Request): {...}`.
    const detail =
      "Failed to fetch plugin source. Check that the source is valid.";
    const error = new HttpError(
      400,
      "Bad Request",
      { detail },
      `HTTP request failed (400 Bad Request): ${JSON.stringify({ detail })}`,
    );

    expect(isCorsOrNetworkError(error)).toBe(false);
    expect(getUserFacingConnectionErrorMessage(error)).toBe(detail);
  });

  it("falls back to the HttpError message when the body carries no reason", () => {
    const error = new HttpError(500, "Internal Server Error", "oops");

    expect(getUserFacingConnectionErrorMessage(error)).toBe(
      "HTTP 500: Internal Server Error",
    );
  });
});
