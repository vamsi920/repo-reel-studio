import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DeepWikiService from "#/api/deepwiki-service/deepwiki-service.api";
import { KtAskPanel } from "#/components/features/knowledge/kt-ask-panel";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const snapshot: RepositorySnapshot = {
  repositoryId: "acme/app",
  owner: "local",
  repo: "app",
  branch: "main",
  commitSha: "abc1234def",
  localPath: "/workspace/app",
};

describe("KtAskPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("asks the KT service about the snapshot's repo and shows the answer", async () => {
    // Arrange
    const chat = vi
      .spyOn(DeepWikiService, "chatCompletion")
      .mockResolvedValue(
        "Retries `408` and `429` (`source/utils/normalize.ts:17`).",
      );
    render(<KtAskPanel snapshot={snapshot} />);

    // Act
    await userEvent.type(
      screen.getByRole("textbox"),
      "Which status codes retry?",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "KT$ASK_SUBMIT" }),
    );

    // Assert
    expect(await screen.findByTestId("kt-ask-answer")).toHaveTextContent(
      "normalize.ts:17",
    );
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        repo_url: "/workspace/app",
        type: "local",
        model: "gemini-2.5-pro",
        messages: [{ role: "user", content: "Which status codes retry?" }],
      }),
    );
  });

  it("shows the service error instead of an empty answer", async () => {
    // Arrange
    vi.spyOn(DeepWikiService, "chatCompletion").mockRejectedValue(
      new Error("repo not indexed"),
    );
    render(<KtAskPanel snapshot={snapshot} />);

    // Act
    await userEvent.type(screen.getByRole("textbox"), "Anything?");
    await userEvent.click(
      screen.getByRole("button", { name: "KT$ASK_SUBMIT" }),
    );

    // Assert
    expect(await screen.findByRole("alert")).toHaveTextContent("KT$ASK_ERROR");
    expect(screen.queryByTestId("kt-ask-answer")).not.toBeInTheDocument();
  });
});
