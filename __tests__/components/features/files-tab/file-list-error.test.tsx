import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  FileListErrorMessage,
  FileListStaleNotice,
} from "#/components/features/files-tab/file-list-error";

// These two states are deliberately distinct (see the component's own
// comments): a failed listing with nothing to fall back on replaces the
// whole list, while a failed *refresh* keeps the stale list visible under a
// banner. Neither had any direct test coverage before this — only the
// (different) truncated-notice sibling did.
describe("FileListErrorMessage", () => {
  it("renders as an alert with a retry action that calls onRetry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<FileListErrorMessage onRetry={onRetry} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("FILES$LIST_LOAD_ERROR");

    await user.click(
      screen.getByTestId("files-tab-list-retry"),
    );

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("FileListStaleNotice", () => {
  it("renders as an alert banner with a retry button that calls onRetry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<FileListStaleNotice onRetry={onRetry} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("FILES$LIST_REFRESH_ERROR");

    await user.click(screen.getByTestId("files-tab-list-stale-retry"));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
