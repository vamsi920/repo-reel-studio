import { AxiosError } from "axios";
import {
  isAxiosErrorWithErrorField,
  isAxiosErrorWithMessageField,
} from "./type-guards";
import {
  getApiErrorBody,
  getApiErrorBodyMessage,
  hasHttpResponseStatus,
} from "./api-error-message";
import { getUserFacingConnectionErrorMessage } from "./user-facing-error";

function isAxiosError(error: unknown): error is AxiosError {
  return (
    typeof error === "object" &&
    error !== null &&
    "isAxiosError" in error &&
    (error as { isAxiosError?: unknown }).isAxiosError === true
  );
}

/**
 * Retrieve the error message from an Axios error
 * @param error The error to render a toast for
 */
export const retrieveAxiosErrorMessage = (error: unknown): string => {
  let errorMessage: string | null = null;
  let shouldPreferExtractedMessage = false;

  if (isAxiosError(error)) {
    shouldPreferExtractedMessage = true;
    if (isAxiosErrorWithErrorField(error) && error.response?.data.error) {
      errorMessage = error.response?.data.error;
    } else if (
      isAxiosErrorWithMessageField(error) &&
      error.response?.data.message
    ) {
      errorMessage = error.response?.data.message;
    } else {
      // FastAPI's standard `{"detail": "..."}` shape.
      errorMessage =
        getApiErrorBodyMessage(getApiErrorBody(error)) ?? error.message;
    }
  } else if (hasHttpResponseStatus(error)) {
    // Shared TypeScript client `HttpError`: the server answered, so show its
    // `detail`/`message` rather than the wrapper text with the raw JSON body.
    return (
      getApiErrorBodyMessage(getApiErrorBody(error)) ??
      (error instanceof Error ? error.message : "")
    );
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  } else {
    errorMessage = null;
  }

  // An axios error that carries a response reached the backend; its extracted
  // body text must not be re-read as a network failure.
  if (shouldPreferExtractedMessage && hasHttpResponseStatus(error)) {
    return errorMessage ?? "";
  }

  const userFacingMessage = getUserFacingConnectionErrorMessage(
    shouldPreferExtractedMessage ? (errorMessage ?? error) : error,
  );
  return userFacingMessage ?? errorMessage ?? "";
};
