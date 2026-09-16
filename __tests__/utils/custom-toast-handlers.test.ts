import { describe, it, expect, vi, beforeEach } from "vitest";
import toast from "react-hot-toast";
import { AxiosError, AxiosHeaders } from "axios";
import { I18nKey } from "#/i18n/declaration";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: toastMock,
}));

describe("custom-toast-handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("displaySuccessToast", () => {
    it("should call toast.success with calculated duration for short message", () => {
      const shortMessage = "Settings saved";
      displaySuccessToast(shortMessage);

      expect(toast.success).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          duration: 5000, // Should use minimum duration of 5000ms
          position: "top-right",
          style: expect.objectContaining({
            borderRadius: "var(--oh-radius)",
            maxWidth: "400px",
            wordBreak: "break-word",
          }),
        }),
      );
    });

    it("should call toast.success with longer duration for long message", () => {
      const longMessage =
        "Settings saved. For old conversations, you will need to stop and restart the conversation to see the changes.";
      displaySuccessToast(longMessage);

      expect(toast.success).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          duration: expect.any(Number),
          position: "top-right",
          style: expect.objectContaining({
            borderRadius: "var(--oh-radius)",
            maxWidth: "400px",
            wordBreak: "break-word",
          }),
        }),
      );

      // Get the actual duration that was passed
      const callArgs = (
        toast.success as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls[0][1] as { duration: number };
      const actualDuration = callArgs.duration;

      // For a long message, duration should be more than the minimum 5000ms
      expect(actualDuration).toBeGreaterThan(5000);
      // But should not exceed the maximum 10000ms
      expect(actualDuration).toBeLessThanOrEqual(10000);
    });
  });

  describe("displayErrorToast", () => {
    const renderedMessage = () => {
      const content = toastMock.mock.calls[0][0] as {
        props: { message: string };
      };
      return content.props.message;
    };

    it("rewrites a bare transport failure to the connectivity message", () => {
      displayErrorToast("TypeError: Failed to fetch");

      expect(renderedMessage()).toBe(I18nKey.ERROR$CORS_OR_NETWORK);
    });

    it("shows a backend reason verbatim when the error carries an HTTP status", () => {
      // FastAPI's detail for a bad plugin source contains "failed to fetch",
      // which must not be mistaken for a network failure.
      const detail =
        "Failed to fetch plugin source. Check that the source is valid.";
      const httpError = Object.assign(
        new Error(
          `HTTP request failed (400 Bad Request): {"detail":"${detail}"}`,
        ),
        { status: 400, response: { detail } },
      );

      displayErrorToast(detail, { error: httpError });

      expect(renderedMessage()).toBe(detail);
    });

    it("shows an axios response body verbatim even when it reads like a network error", () => {
      const detail = "Network error while cloning the plugin repository";
      const axiosError = new AxiosError(
        "Request failed with status code 502",
        "ERR_BAD_RESPONSE",
        { headers: new AxiosHeaders() },
        undefined,
        {
          status: 502,
          statusText: "Bad Gateway",
          headers: {},
          config: { headers: new AxiosHeaders() },
          data: { detail },
        },
      );

      displayErrorToast(detail, { error: axiosError });

      expect(renderedMessage()).toBe(detail);
    });

    it("still rewrites the message when the error has no HTTP status", () => {
      const transportError = new TypeError("Failed to fetch");

      displayErrorToast(transportError.message, { error: transportError });

      expect(renderedMessage()).toBe(I18nKey.ERROR$CORS_OR_NETWORK);
    });

    it("should call toast with calculated duration for short message", () => {
      const shortMessage = "Error occurred";
      displayErrorToast(shortMessage);

      expect(toastMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          duration: 4000, // Should use minimum duration of 4000ms for errors
          position: "top-right",
          icon: null,
          style: expect.objectContaining({
            borderRadius: "var(--oh-radius)",
            maxWidth: "400px",
            wordBreak: "break-word",
            color: "var(--oh-muted)",
          }),
        }),
      );
    });

    it("should call toast with longer duration for long error message", () => {
      const longMessage =
        "A very long error message that should take more time to read and understand what went wrong with the operation.";
      displayErrorToast(longMessage);

      expect(toastMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          duration: expect.any(Number),
          position: "top-right",
          icon: null,
          style: expect.objectContaining({
            borderRadius: "var(--oh-radius)",
            maxWidth: "400px",
            wordBreak: "break-word",
            color: "var(--oh-muted)",
          }),
        }),
      );

      // Get the actual duration that was passed
      const callArgs = toastMock.mock.calls[0][1] as { duration: number };
      const actualDuration = callArgs.duration;

      // For a long message, duration should be more than the minimum 4000ms
      expect(actualDuration).toBeGreaterThan(4000);
      // But should not exceed the maximum 10000ms
      expect(actualDuration).toBeLessThanOrEqual(10000);
    });
  });
});
