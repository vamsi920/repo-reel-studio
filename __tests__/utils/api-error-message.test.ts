import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import { HttpError } from "@openhands/typescript-client";
import {
  getApiErrorBodyMessage,
  getApiErrorMessage,
  hasHttpResponseStatus,
} from "#/utils/api-error-message";

describe("getApiErrorMessage", () => {
  it("returns the body `detail` from an HttpError when no `message` is present", () => {
    // Arrange — FastAPI-style error body on the shared client's HttpError.
    const error = new HttpError(422, "Unprocessable Entity", {
      detail: "Automation spec is invalid",
    });

    // Act + Assert
    expect(getApiErrorMessage(error, "fallback")).toBe(
      "Automation spec is invalid",
    );
  });

  it("returns the response body `message` from an axios error", () => {
    // Arrange — local agent-server calls still reject with AxiosError.
    const error = new AxiosError("Request failed with status code 500");
    error.response = {
      status: 500,
      data: { message: "Runner exploded" },
    } as never;

    // Act + Assert
    expect(getApiErrorMessage(error, "fallback")).toBe("Runner exploded");
  });

  it("returns the fallback when the error carries no usable information", () => {
    expect(getApiErrorMessage(null, "fallback")).toBe("fallback");
  });
});

describe("getApiErrorBodyMessage", () => {
  it("prefers message, then detail, then error", () => {
    expect(getApiErrorBodyMessage({ message: "m", detail: "d" })).toBe("m");
    expect(getApiErrorBodyMessage({ detail: "d", error: "e" })).toBe("d");
    expect(getApiErrorBodyMessage({ error: "e" })).toBe("e");
  });

  it("returns null for non-object bodies and non-string fields", () => {
    expect(getApiErrorBodyMessage("plain text")).toBeNull();
    expect(getApiErrorBodyMessage(undefined)).toBeNull();
    expect(getApiErrorBodyMessage({ detail: [{ msg: "x" }] })).toBeNull();
  });
});

describe("hasHttpResponseStatus", () => {
  it("is true for an HttpError and an axios error with a response", () => {
    expect(hasHttpResponseStatus(new HttpError(400, "Bad Request"))).toBe(true);

    const axiosError = new AxiosError("Request failed with status code 500");
    axiosError.response = { status: 500, data: {} } as never;
    expect(hasHttpResponseStatus(axiosError)).toBe(true);
  });

  it("is false for transport failures without a response", () => {
    expect(hasHttpResponseStatus(new AxiosError("Network Error"))).toBe(false);
    expect(
      hasHttpResponseStatus(new Error("Request failed: Failed to fetch")),
    ).toBe(false);
    expect(hasHttpResponseStatus(new HttpError(0, ""))).toBe(false);
  });
});
