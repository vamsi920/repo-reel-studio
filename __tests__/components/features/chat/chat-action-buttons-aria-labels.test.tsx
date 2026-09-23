import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nKey } from "#/i18n/declaration";
import { RemoveFileButton } from "#/components/features/chat/remove-file-button";
import { ChatSendButton } from "#/components/features/chat/chat-send-button";
import { ChatResumeAgentButton } from "#/components/features/chat/chat-play-button";
import { ChatStopButton } from "#/components/features/chat/chat-stop-button";

// These icon-only buttons previously rendered with no accessible name at
// all, so a screen reader announced only "button" with no indication of
// what it does.
describe("chat action buttons accessible names", () => {
  it("RemoveFileButton exposes the file name in its aria-label", () => {
    render(<RemoveFileButton onClick={vi.fn()} fileName="report.pdf" />);
    expect(
      screen.getByRole("button", {
        name: I18nKey.FILE_ITEM$REMOVE_FILE,
      }),
    ).toBeInTheDocument();
  });

  it("ChatSendButton has an aria-label", () => {
    render(
      <ChatSendButton
        buttonClassName=""
        handleSubmit={vi.fn()}
        disabled={false}
      />,
    );
    expect(
      screen.getByTestId("submit-button"),
    ).toHaveAttribute("aria-label", I18nKey.BUTTON$SEND);
  });

  it("ChatResumeAgentButton has an aria-label", () => {
    render(<ChatResumeAgentButton onAgentResumed={vi.fn()} />);
    expect(screen.getByTestId("play-button")).toHaveAttribute(
      "aria-label",
      I18nKey.ACTION_BUTTON$RESUME,
    );
  });

  it("ChatStopButton has an aria-label", () => {
    render(<ChatStopButton handleStop={vi.fn()} />);
    expect(screen.getByTestId("stop-button")).toHaveAttribute(
      "aria-label",
      I18nKey.BUTTON$PAUSE,
    );
  });
});
