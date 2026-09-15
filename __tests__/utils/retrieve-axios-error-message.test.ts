import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import { HttpError } from "@openhands/typescript-client";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { CORS_OR_NETWORK_ERROR_MESSAGE } from "#/utils/user-facing-error";

const PLUGIN_SOURCE_DETAIL =
  "Failed to fetch plugin source. Check that the source is valid.";

function pluginSourceHttpError() {
  const body = { detail: PLUGIN_SOURCE_DETAIL };
  return new HttpError(
    400,
    "Bad Request",
    body,
    `HTTP request failed (400 Bad Request): ${JSON.stringify(body)}`,
  );
}

describe("retrieveAxiosErrorMessage", () => {
  it("shows the backend `detail` for a shared-client HttpError instead of the raw JSON wrapper", () => {
    expect(retrieveAxiosErrorMessage(pluginSourceHttpError())).toBe(
      PLUGIN_SOURCE_DETAIL,
    );
  });

  it("does not misclassify an HTTP 400 whose detail mentions 'failed to fetch' as a network error", () => {
    expect(retrieveAxiosErrorMessage(pluginSourceHttpError())).not.toBe(
      CORS_OR_NETWORK_ERROR_MESSAGE,
    );
  });

  it("still maps a real fetch failure to the network message", () => {
    expect(
      retrieveAxiosErrorMessage(new Error("Request failed: Failed to fetch")),
    ).toBe(CORS_OR_NETWORK_ERROR_MESSAGE);
  });

  it("reads FastAPI `detail` from an axios error response", () => {
    const error = new AxiosError("Request failed with status code 400");
    error.response = {
      status: 400,
      data: { detail: PLUGIN_SOURCE_DETAIL },
    } as never;

    expect(retrieveAxiosErrorMessage(error)).toBe(PLUGIN_SOURCE_DETAIL);
  });

  it("keeps preferring the `error` field on an axios response", () => {
    const error = new AxiosError("Request failed with status code 500");
    error.response = {
      status: 500,
      data: { error: "Runner exploded", detail: "ignored" },
    } as never;

    expect(retrieveAxiosErrorMessage(error)).toBe("Runner exploded");
  });

  it("falls back to the axios message when the response body has no reason", () => {
    const error = new AxiosError("Request failed with status code 401");
    error.response = { status: 401, data: "Unauthorized" } as never;

    expect(retrieveAxiosErrorMessage(error)).toBe(
      "Request failed with status code 401",
    );
  });
});
